import { Request, Response } from "express";
import { runBatchRecovery } from "../services/recovery-engine";
import { prisma } from "../services/db";
import { log } from "../services/audit.service";

/** POST /api/agent/run-batch — Triggers AI recovery on all pending failed transactions */
export async function runBatch(req: Request, res: Response): Promise<void> {
  try {
    await log("BATCH_TRIGGERED", "USER", { source: "dashboard" });
    const result = await runBatchRecovery();
    res.json({
      success: true,
      message: `Processed ${result.processed} transactions`,
      ...result,
    });
  } catch (error) {
    await log("BATCH_ERROR", "SYSTEM", { error: String(error) });
    res
      .status(500)
      .json({ error: "Batch recovery failed", details: String(error) });
  }
}

/** GET /api/agent/batches — Returns all batch runs with actual recovered amounts */
export async function getBatches(req: Request, res: Response): Promise<void> {
  try {
    const batches = await prisma.recoveryBatch.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    });

    const enriched = await Promise.all(
      batches.map(async (batch) => {
        const recovered = await prisma.transaction.aggregate({
          where: {
            status: "RECOVERED",
            updatedAt: {
              gte: batch.startedAt,
              lte: batch.completedAt || new Date(),
            },
          },
          _sum: { recoveredAmount: true },
          _count: true,
        });
        return {
          ...batch,
          actualRecovered: recovered._sum.recoveredAmount || 0,
          recoveredCount: recovered._count,
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch batches", details: String(error) });
  }
}
