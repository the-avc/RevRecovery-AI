import cron from "node-cron";
import { prisma } from "../services/db";
import { executeRecovery } from "../services/recovery-engine";
import { log } from "../services/audit.service";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Starts all background cron jobs:
 * - Every hour: run scheduled actions, promise-to-pay follow-ups, B2B escalations
 * - Every day at 9am: retry failed mandates (payroll time)
 */
export function startCronJobs(): void {
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Running scheduled recovery checks...");
    await Promise.all([
      checkScheduledActions(),
      checkPromiseToPay(),
      checkB2BEscalation(),
    ]);
  });

  cron.schedule("0 9 * * *", async () => {
    console.log("[Cron] Running morning mandate retry sequence...");
    await retryMandates();
  });

  console.log(
    "⏰ Cron jobs started: Scheduled actions (hourly) | Mandate retries (9am daily)",
  );
}

/** Run recovery actions that were scheduled for a future time and are now due */
async function checkScheduledActions(): Promise<void> {
  const dueActions = await prisma.recoveryAction.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
  });

  await Promise.all(
    dueActions.map(async (action) => {
      await log(
        "SCHEDULED_ACTION_DUE",
        "CRON_JOB",
        { actionId: action.id },
        action.transactionId,
      );
      await prisma.recoveryAction.update({
        where: { id: action.id },
        data: { status: "COMPLETED", executedAt: new Date() },
      });
      await executeRecovery(action.transactionId);
    }),
  );
}

/** Follow up on promise-to-pay transactions whose promised date has now passed */
async function checkPromiseToPay(): Promise<void> {
  const overduePromises = await prisma.transaction.findMany({
    where: { status: "PROMISE_TO_PAY", promisedPayDate: { lte: new Date() } },
  });

  await Promise.all(
    overduePromises.map(async (txn) => {
      await log(
        "PROMISE_TO_PAY_DUE",
        "CRON_JOB",
        { promisedDate: txn.promisedPayDate, amount: txn.amount },
        txn.id,
      );
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { status: "FAILED", promisedPayDate: null },
      });
      await executeRecovery(txn.id);
    }),
  );
}

/**
 * B2B Escalation Engine: escalates overdue invoices every 2 days
 * Day 1 → Polite email | Day 3 → Firm email | Day 5 → Senior escalation
 */
async function checkB2BEscalation(): Promise<void> {
  const b2bTransactions = await prisma.transaction.findMany({
    where: { failureType: "INVOICE_OVERDUE", status: "IN_RECOVERY" },
    // Only fetch the most recent action — that's all we need
    include: { recoveryActions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const now = Date.now();

  await Promise.all(
    b2bTransactions.map(async (txn) => {
      const lastAction = txn.recoveryActions[0];
      if (!lastAction?.executedAt) return;

      const daysSince = (now - lastAction.executedAt.getTime()) / MS_PER_DAY;

      if (daysSince >= 2 && txn.retryCount < 3) {
        await log(
          "B2B_ESCALATION_TRIGGERED",
          "CRON_JOB",
          {
            daysSinceLastAction: Math.round(daysSince),
            retryCount: txn.retryCount,
          },
          txn.id,
        );
        await prisma.transaction.update({
          where: { id: txn.id },
          data: { status: "FAILED" },
        });
        await executeRecovery(txn.id);
      }
    }),
  );
}

/** Retries failed mandates on day 1–3 of the month (payroll time, most likely to succeed) */
async function retryMandates(): Promise<void> {
  if (new Date().getDate() > 3) return;

  const failedMandates = await prisma.transaction.findMany({
    where: {
      failureType: "MANDATE_FAILED",
      status: "FAILED",
      retryCount: { lt: 3 },
    },
  });

  await log("MANDATE_RETRY_BATCH", "CRON_JOB", {
    count: failedMandates.length,
  });

  // Sequential — this can be a large batch, avoid hammering Razorpay/AI APIs
  for (const txn of failedMandates) {
    await executeRecovery(txn.id);
  }
}
