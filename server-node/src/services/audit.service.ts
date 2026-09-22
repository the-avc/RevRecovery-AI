import { prisma } from "./db";

/**
 * Immutable audit log writer. Every system event is logged here.
 * This fulfills the hackathon requirement for "audit trail".
 */
export async function log(
  event: string,
  actor: "RAZORPAY_WEBHOOK" | "AI_AGENT" | "CRON_JOB" | "USER" | "SYSTEM",
  details: object,
  transactionId?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        actor,
        details,
        transactionId: transactionId || null,
      },
    });
    console.log(
      `[AUDIT] [${actor}] ${event}`,
      transactionId ? `| txn: ${transactionId}` : "",
    );
  } catch (error) {
    // Audit log failures should never crash the main flow
    console.error("[AUDIT] Failed to write log:", error);
  }
}
