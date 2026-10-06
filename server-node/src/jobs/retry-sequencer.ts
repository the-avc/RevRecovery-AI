import cron from "node-cron";
import { prisma } from "../services/db";
import { executeRecovery } from "../services/recovery-engine";
import { log } from "../services/audit.service";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Cron:
 * - Every 5m -> execute due scheduled actions (voice calls, delayed links) promptly.
 * - Hourly -> overdue promise-to-pay + B2B multi-day escalation checks.
 * - Daily 9am (1st-3rd of month) -> mandate retries at salary/payroll time.
 */
export function startCronJobs(): void {
  cron.schedule("*/5 * * * *", checkScheduledActions);
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Hourly recovery checks...");
    await Promise.allSettled([checkPromiseToPay(), checkB2BEscalation()]);
  });
  cron.schedule("0 9 1-3 * *", retryMandates);
  console.log("Cron started: 5m scheduled actions | hourly checks | mandate retry 9am (days 1-3)");
}

/** Due SCHEDULED actions -> mark completed & record delivery timestamps */
async function checkScheduledActions(): Promise<void> {
  const due = await prisma.recoveryAction.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    select: { id: true, transactionId: true, paymentLinkUrl: true, actionType: true },
  });
  for (const a of due) {
    const now = new Date();
    await log("SCHEDULED_ACTION_EXECUTED", "CRON_JOB", { actionId: a.id, actionType: a.actionType }, a.transactionId);
    await prisma.recoveryAction.update({
      where: { id: a.id },
      data: {
        status: "COMPLETED",
        executedAt: now,
        emailSentAt: a.paymentLinkUrl ? now : undefined,
        voiceCallAt: a.actionType === "HINGLISH_VOICE_CALL" ? now : undefined,
      },
    });
  }
}

/** Promised date passed -> trigger follow-up recovery */
async function checkPromiseToPay(): Promise<void> {
  const overdue = await prisma.transaction.findMany({
    where: { status: "PROMISE_TO_PAY", promisedPayDate: { lte: new Date() } },
    select: { id: true, promisedPayDate: true, amount: true },
  });
  for (const t of overdue) {
    await log("PROMISE_TO_PAY_DUE", "CRON_JOB", { promisedDate: t.promisedPayDate, amount: t.amount }, t.id);
    await prisma.transaction.update({
      where: { id: t.id },
      data: { status: "FAILED" },
    });
    await executeRecovery(t.id);
  }
}

/** B2B: no action for >= 2 days + retries left -> trigger next email in escalation ladder */
async function checkB2BEscalation(): Promise<void> {
  const txns = await prisma.transaction.findMany({
    where: {
      failureType: "INVOICE_OVERDUE",
      status: "IN_RECOVERY",
      retryCount: { lt: 3 },
    },
    include: { recoveryActions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  for (const t of txns) {
    const last = t.recoveryActions[0];
    if (!last?.executedAt && !last?.createdAt) continue;
    const daysSince = (Date.now() - (last.executedAt || last.createdAt).getTime()) / MS_PER_DAY;
    if (daysSince >= 2) {
      await log("B2B_ESCALATION_TRIGGERED", "CRON_JOB", { daysSince: Math.round(daysSince), retryCount: t.retryCount }, t.id);
      await prisma.transaction.update({
        where: { id: t.id },
        data: { status: "FAILED" },
      });
      await executeRecovery(t.id);
    }
  }
}

/** Day 1-3 mandates with retries left -> re-run engine sequentially */
async function retryMandates(): Promise<void> {
  console.log("[Cron] Morning mandate retries...");
  const failed = await prisma.transaction.findMany({
    where: {
      failureType: "MANDATE_FAILED",
      status: { in: ["FAILED", "IN_RECOVERY"] },
      retryCount: { lt: 3 },
    },
    select: { id: true },
  });
  await log("MANDATE_RETRY_BATCH", "CRON_JOB", { count: failed.length });
  for (const t of failed) await executeRecovery(t.id);
}
