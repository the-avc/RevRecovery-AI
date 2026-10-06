import { ActionType } from "@prisma/client";
import { prisma } from "./db";
import { getAIDecision, generateHinglishVoice } from "./python-bridge";
import { generateRecoveryPaymentLink } from "./razorpay.service";
import { log } from "./audit.service";

/**
 * Recovery Engine: AI decision -> Razorpay link -> DB + audit trail.
 * Stopping rules: RECOVERED skip, retryCount >= 3 -> ABANDONED, payment cancels pending actions.
 */
export async function executeRecovery(transactionId: string): Promise<void> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { customer: true },
  });
  if (!txn)
    return console.error(`[Recovery] Transaction ${transactionId} not found`);
  if (txn.status === "RECOVERED" || txn.status === "ABANDONED")
    return console.log(
      `[Recovery] ${transactionId} is already ${txn.status}. Skipping.`,
    );
  if (txn.retryCount >= 3) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "ABANDONED" },
    });
    await prisma.recoveryAction.updateMany({
      where: { transactionId, status: { in: ["PENDING", "SCHEDULED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Max retries reached" },
    });
    return log(
      "MAX_RETRIES_REACHED",
      "SYSTEM",
      { retryCount: txn.retryCount },
      transactionId,
    );
  }

  await log(
    "RECOVERY_ENGINE_STARTED",
    "AI_AGENT",
    { transactionId },
    transactionId,
  );

  // Step 1: Get AI Decision from Python engine
  const aiDecision = await getAIDecision({
    transactionId: txn.id,
    customerId: txn.customerId,
    customerName: txn.customer.name,
    customerEmail: txn.customer.email,
    customerPhone: txn.customer.phone || undefined,
    customerType: txn.customer.type as "B2C" | "B2B",
    amount: txn.amount,
    failureType: txn.failureType,
    errorCode: txn.errorCode || undefined,
    errorDescription: txn.errorDescription || undefined,
    retryCount: txn.retryCount,
    cartItems: (txn.cartItems as object[]) || undefined,
    invoiceDueDate: txn.invoiceDueDate?.toISOString(),
    subscriptionId: txn.subscriptionId || undefined,
    minutesSinceFailure: Math.max(
      0,
      Math.round((Date.now() - txn.createdAt.getTime()) / 60000),
    ),
    promisedPayDate: txn.promisedPayDate?.toISOString(),
  });

  await log(
    "AI_DECISION_MADE",
    "AI_AGENT",
    { decision: aiDecision },
    transactionId,
  );

  // Step 2: Validate AI action — fallback safely so recovery is never silently dropped
  let actionType = aiDecision.action as ActionType;
  if (!Object.values(ActionType).includes(actionType)) {
    await log("AI_INVALID_ACTION", "AI_AGENT", { received: aiDecision.action }, transactionId);
    actionType = ActionType.IMMEDIATE_RETRY_LINK;
  }
  const aiFields = {
    aiRootCause: aiDecision.rootCause,
    aiReasoning: aiDecision.reasoning,
    aiConfidence: aiDecision.confidence,
    recoveryProb: aiDecision.recoveryProbability,
  };

  if (actionType === "NO_ACTION") {
    await prisma.recoveryAction.create({
      data: {
        transactionId,
        actionType: "NO_ACTION",
        status: "COMPLETED",
        ...aiFields,
        executedAt: new Date(),
      },
    });
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "ABANDONED" },
    });
    await log(
      "NO_ACTION_TAKEN",
      "AI_AGENT",
      { reason: aiDecision.reasoning },
      transactionId,
    );
    return;
  }

  // Step 3: Razorpay link for all actions except promise follow-ups (no new payment needed)
  const needsPaymentLink = actionType !== "PROMISE_TO_PAY_FOLLOWUP";
  let paymentLinkUrl: string | undefined,
    paymentLinkId: string | undefined,
    voiceAudioPath: string | undefined;

  if (needsPaymentLink) {
    const discount = Math.max(0, Math.min(100, aiDecision.discountPercent || 0));
    const finalAmount = discount ? txn.amount * (1 - discount / 100) : txn.amount;

    try {
      const link = await generateRecoveryPaymentLink({
        amount: Math.max(100, Math.round(finalAmount * 100)), // paise, min Rs.1
        customerName: txn.customer.name,
        customerEmail: txn.customer.email,
        customerPhone: txn.customer.phone || undefined,
        description: linkDescription(
          txn.failureType,
          discount || undefined,
        ),
        referenceId: txn.id,
        expireBy: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      });
      paymentLinkUrl = link.short_url;
      paymentLinkId = link.id;
      await log(
        "PAYMENT_LINK_GENERATED",
        "AI_AGENT",
        { linkId: link.id, amount: finalAmount },
        transactionId,
      );
    } catch (err) {
      await log(
        "PAYMENT_LINK_FAILED",
        "AI_AGENT",
        { error: String(err) },
        transactionId,
      );
    }
  }

  // Step 4: Hinglish voice for high-value transactions
  if (actionType === "HINGLISH_VOICE_CALL") {
    const voice = await generateHinglishVoice(
      txn.customer.name,
      txn.amount,
    );
    if (voice.audioPath) {
      voiceAudioPath = voice.audioPath;
      await log(
        "HINGLISH_VOICE_GENERATED",
        "AI_AGENT",
        { audioPath: voice.audioPath },
        transactionId,
      );
    }
  }

  // Steps 5-6: save action, bump retry count (ignore past/garbage promise dates)
  const now = new Date();
  const scheduledFor = aiDecision.scheduledDelay
    ? new Date(now.getTime() + aiDecision.scheduledDelay * 60 * 1000)
    : now;
  await prisma.recoveryAction.create({
    data: {
      transactionId,
      actionType,
      status: aiDecision.scheduledDelay ? "SCHEDULED" : "COMPLETED",
      ...aiFields,
      paymentLinkUrl,
      paymentLinkId,
      voiceAudioPath,
      voiceCallAt:
        actionType === "HINGLISH_VOICE_CALL" && voiceAudioPath && !aiDecision.scheduledDelay
          ? now
          : undefined,
      scheduledFor,
      emailSentAt:
        needsPaymentLink && !aiDecision.scheduledDelay ? now : undefined,
      executedAt: aiDecision.scheduledDelay ? undefined : now,
    },
  });
  let nextPromisedDate: Date | null = null;
  if (aiDecision.promisedPayDate) {
    const parsed = new Date(aiDecision.promisedPayDate);
    if (!isNaN(+parsed) && parsed > now) nextPromisedDate = parsed;
  }
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: nextPromisedDate ? "PROMISE_TO_PAY" : "IN_RECOVERY",
      retryCount: txn.retryCount + 1,
      promisedPayDate: nextPromisedDate,
      razorpayLinkId: paymentLinkId || txn.razorpayLinkId,
    },
  });
  await log(
    "RECOVERY_ACTION_EXECUTED",
    "AI_AGENT",
    {
      actionType,
      paymentLinkUrl,
      recoveryProbability: aiDecision.recoveryProbability,
    },
    transactionId,
  );
  console.log(
    `[Recovery] ${actionType} for ${transactionId} | P=${aiDecision.recoveryProbability}`,
  );
}

let isBatchRunning = false;

/** Batch: run recovery on all FAILED txns (retryCount < 3). Sequential + 500ms to avoid rate limits. */
export async function runBatchRecovery(): Promise<{
  processed: number;
  totalAtRisk: number;
  batchId: string;
}> {
  if (isBatchRunning) throw new Error("A batch recovery run is already in progress.");
  isBatchRunning = true;
  try {
    const failed = await prisma.transaction.findMany({
      where: { status: "FAILED", retryCount: { lt: 3 } },
    });
    if (!failed.length) return { processed: 0, totalAtRisk: 0, batchId: "none" };
    const batch = await prisma.recoveryBatch.create({
      data: {
        totalAtRisk: failed.reduce((s, t) => s + t.amount, 0),
        transactionCount: failed.length,
      },
    });
    await log("BATCH_RECOVERY_STARTED", "AI_AGENT", {
      batchId: batch.id,
      count: failed.length,
    });
    for (const txn of failed) {
      try {
        await executeRecovery(txn.id);
      } catch (err) {
        console.error(`[Batch] Failed to recover transaction ${txn.id}:`, err);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    await prisma.recoveryBatch.update({
      where: { id: batch.id },
      data: { completedAt: new Date(), status: "COMPLETED" },
    });
    await log("BATCH_RECOVERY_COMPLETED", "AI_AGENT", {
      batchId: batch.id,
      processed: failed.length,
    });
    return {
      processed: failed.length,
      totalAtRisk: batch.totalAtRisk,
      batchId: batch.id,
    };
  } finally {
    isBatchRunning = false;
  }
}

const LINK_DESC: Record<string, string> = {
  PAYMENT_FAILED: "Complete your pending payment",
  CHECKOUT_ABANDONED: "Your cart is waiting! Complete your purchase",
  SUBSCRIPTION_FAILED: "Renew your subscription",
  INVOICE_OVERDUE: "Settle your overdue invoice",
  MANDATE_FAILED: "Retry your auto-debit",
};
const linkDescription = (failureType: string, discount?: number) => {
  const base = LINK_DESC[failureType] || "Complete your payment";
  return discount ? `${base} -- ${discount}% off applied!` : base;
};
