import { Request, Response } from "express";
import { prisma } from "../services/db";
import { extractPromiseToPay } from "../services/python-bridge";
import { executeRecovery } from "../services/recovery-engine";
import { log } from "../services/audit.service";

/** GET /api/dashboard/stats — totals, recovery rate, breakdowns, recent recoveries */
export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const [totals, byStatus, recent, byFailure] = await Promise.all([
      prisma.transaction.aggregate({ _sum: { amount: true, recoveredAmount: true }, _count: true }),
      prisma.transaction.groupBy({ by: ["status"], _count: true, _sum: { amount: true } }),
      prisma.transaction.findMany({ where: { status: "RECOVERED" }, include: { customer: true }, orderBy: { recoveredAt: "desc" }, take: 10 }),
      prisma.transaction.groupBy({ by: ["failureType"], _count: true, _sum: { amount: true } }),
    ]);
    const atRisk = totals._sum.amount || 0;
    res.json({
      totalAtRisk: atRisk,
      totalRecovered: totals._sum.recoveredAmount || 0,
      recoveryRate: atRisk ? Math.round(((totals._sum.recoveredAmount || 0) / atRisk) * 1000) / 10 : 0,
      totalTransactions: totals._count,
      statusBreakdown: byStatus,
      failureTypeBreakdown: byFailure,
      recentRecoveries: recent,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats", details: String(error) });
  }
}

const pageArgs = (req: Request, def = 20) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || def));
  return { page, limit, skip: (page - 1) * limit };
};

/** GET /api/dashboard/transactions — paginated list, filterable by status/failureType */
export async function getTransactions(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, skip } = pageArgs(req);
    const where: Record<string, unknown> = {};
    if (req.query.status && req.query.status !== "ALL") where.status = req.query.status as string;
    if (req.query.failureType && req.query.failureType !== "ALL") where.failureType = req.query.failureType as string;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, include: { customer: true, recoveryActions: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.transaction.count({ where }),
    ]);
    res.json({ transactions, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions", details: String(error) });
  }
}

/** GET /api/dashboard/audit-logs — paginated trail, filterable by transactionId */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, skip } = pageArgs(req, 50);
    const where: Record<string, unknown> = {};
    if (req.query.transactionId) where.transactionId = req.query.transactionId as string;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs", details: String(error) });
  }
}

/** GET /api/dashboard/transactions/:id — one transaction with all actions + logs */
export async function getTransactionDetail(req: Request, res: Response): Promise<void> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id as string },
      include: { customer: true, recoveryActions: { orderBy: { createdAt: "asc" } }, auditLogs: { orderBy: { createdAt: "asc" } } },
    });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transaction", details: String(error) });
  }
}

/** POST /api/dashboard/transactions/:id/promise — Extracts promise-to-pay date from message & schedules follow-up */
export async function recordPromiseToPay(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { message } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ success: false, error: "A non-empty customer message string is required." });
      return;
    }

    const txn = await prisma.transaction.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!txn) {
      res.status(404).json({ success: false, error: "Transaction not found." });
      return;
    }

    // Call Python NLP bridge
    const result = await extractPromiseToPay(message.trim());

    if (result.promisedDate) {
      const parsedDate = new Date(result.promisedDate);

      // Update transaction status and promise date
      const updated = await prisma.transaction.update({
        where: { id },
        data: {
          status: "PROMISE_TO_PAY",
          promisedPayDate: parsedDate,
        },
      });

      // Create a scheduled follow-up action
      await prisma.recoveryAction.create({
        data: {
          transactionId: id,
          actionType: "PROMISE_TO_PAY_FOLLOWUP",
          status: "SCHEDULED",
          scheduledFor: parsedDate,
          aiRootCause: "Customer provided promise-to-pay date",
          aiReasoning: `Customer message: "${message.trim()}". AI extracted target pay date ${result.promisedDate} (${(result.confidence * 100).toFixed(0)}% confidence). Follow-up scheduled upon expiry.`,
          aiConfidence: result.confidence,
          recoveryProb: Math.min(0.9, result.confidence || 0.7),
        },
      });

      await log(
        "PROMISE_TO_PAY_RECORDED",
        "USER",
        {
          customerMessage: message.trim(),
          promisedDate: result.promisedDate,
          confidence: result.confidence,
          rawMention: result.rawMention,
        },
        id,
      );

      res.json({
        success: true,
        promisedDate: result.promisedDate,
        confidence: result.confidence,
        rawMention: result.rawMention,
        status: updated.status,
        message: `Promise-to-pay recorded for ${result.promisedDate}`,
      });
    } else {
      await log(
        "CUSTOMER_MESSAGE_UNRECOGNIZED",
        "USER",
        { customerMessage: message.trim(), reason: "No clear payment date identified" },
        id,
      );
      res.json({
        success: false,
        promisedDate: null,
        confidence: result.confidence,
        rawMention: null,
        status: txn.status,
        message: "No specific date or commitment window detected in the customer message.",
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process customer promise", details: String(error) });
  }
}

/** POST /api/dashboard/transactions/:id/recover — Triggers AI recovery on a single transaction */
export async function retryRecovery(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const txn = await prisma.transaction.findUnique({ where: { id } });
    if (!txn) {
      res.status(404).json({ success: false, error: "Transaction not found." });
      return;
    }
    await executeRecovery(id);
    const updated = await prisma.transaction.findUnique({
      where: { id },
      include: { customer: true, recoveryActions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    res.json({ success: true, transaction: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: "Recovery failed", details: String(error) });
  }
}
