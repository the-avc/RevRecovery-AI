import { prisma } from "./db";

/** Immutable audit log — failures never crash the main flow. */
export async function log(
  event: string,
  actor: "RAZORPAY_WEBHOOK" | "AI_AGENT" | "CRON_JOB" | "USER" | "SYSTEM",
  details: object,
  transactionId?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { event, actor, details: details as never, transactionId: transactionId || null },
    });
    console.log(`[AUDIT] [${actor}] ${event}`, transactionId ? `| txn: ${transactionId}` : "");
  } catch (error) {
    console.error("[AUDIT] Failed to write log:", error);
  }
}
