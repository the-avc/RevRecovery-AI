import { Request, Response } from "express";
import { runBatchRecovery } from "../services/recovery-engine";
import { prisma } from "../services/db";
import { log } from "../services/audit.service";

/** POST /api/agent/run-batch — Triggers AI recovery on all pending failed transactions */
export async function runBatch(_req: Request, res: Response): Promise<void> {
  try {
    await log("BATCH_TRIGGERED", "USER", { source: "dashboard" });
    const result = await runBatchRecovery();
    res.json({ success: true, message: `Processed ${result.processed} transactions`, ...result });
  } catch (error) {
    await log("BATCH_ERROR", "SYSTEM", { error: String(error) });
    res.status(500).json({ error: "Batch recovery failed", details: String(error) });
  }
}

/** GET /api/agent/batches — last 20 runs with actual recovered sums (single query, no N+1) */
export async function getBatches(_req: Request, res: Response): Promise<void> {
  try {
    const batches = await prisma.recoveryBatch.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
    if (!batches.length) {
      res.json([]);
      return;
    }
    const earliest = batches[batches.length - 1].startedAt;
    // One aggregate for all recovered txns since the oldest batch; attribute in memory.
    const recovered = await prisma.transaction.findMany({
      where: { status: "RECOVERED", recoveredAt: { gte: earliest } },
      select: { recoveredAmount: true, recoveredAt: true },
    });
    res.json(
      batches.map((b, i) => {
        const nextBatchStart = i > 0 ? batches[i - 1].startedAt : new Date();
        const inWindow = recovered.filter(
          (t) => t.recoveredAt && t.recoveredAt >= b.startedAt && t.recoveredAt <= nextBatchStart,
        );
        return {
          ...b,
          actualRecovered: inWindow.reduce((s, t) => s + (t.recoveredAmount || 0), 0),
          recoveredCount: inWindow.length,
        };
      }),
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch batches", details: String(error) });
  }
}
