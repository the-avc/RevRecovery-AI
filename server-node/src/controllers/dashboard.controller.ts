import { Request, Response } from "express";
import { prisma } from "../services/db";

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
