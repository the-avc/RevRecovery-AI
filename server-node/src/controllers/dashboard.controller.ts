import { Request, Response } from "express";
import { prisma } from "../services/db";

/** GET /api/dashboard/stats — Core metrics: total at risk, recovered, recovery rate */
export async function getStats(_req: Request, res: Response): Promise<void> {
  const [totalStats, statusBreakdown, recentRecoveries, failureTypeBreakdown] =
    await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true, recoveredAmount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ["status"],
        _count: true,
        _sum: { amount: true },
      }),
      prisma.transaction.findMany({
        where: { status: "RECOVERED" },
        include: { customer: true },
        orderBy: { recoveredAt: "desc" },
        take: 10,
      }),
      prisma.transaction.groupBy({
        by: ["failureType"],
        _count: true,
        _sum: { amount: true },
      }),
    ]);

  const totalAtRisk = totalStats._sum.amount || 0;
  const totalRecovered = totalStats._sum.recoveredAmount || 0;
  const recoveryRate =
    totalAtRisk > 0 ? (totalRecovered / totalAtRisk) * 100 : 0;

  res.json({
    totalAtRisk,
    totalRecovered,
    recoveryRate: Math.round(recoveryRate * 10) / 10,
    totalTransactions: totalStats._count,
    statusBreakdown,
    failureTypeBreakdown,
    recentRecoveries,
  });
}

/** GET /api/dashboard/transactions — Paginated transaction list with optional filters */
export async function getTransactions(
  req: Request,
  res: Response,
): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  // Build filter from query params
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status as string;
  if (req.query.failureType)
    where.failureType = req.query.failureType as string;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        customer: true,
        recoveryActions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ transactions, total, page, totalPages: Math.ceil(total / limit) });
}

/** GET /api/dashboard/audit-logs — Paginated audit trail, optionally filtered by transactionId */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const where: Record<string, unknown> = {};
  if (req.query.transactionId)
    where.transactionId = req.query.transactionId as string;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
}

/** GET /api/dashboard/transactions/:id — Full detail of one transaction with all its actions and logs */
export async function getTransactionDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: req.params.id as string },
    include: {
      customer: true,
      recoveryActions: { orderBy: { createdAt: "asc" } },
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json(transaction);
}
