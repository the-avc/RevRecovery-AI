import { ActionType } from "@prisma/client";
import { prisma } from "./db";
import { getAIDecision, generateHinglishVoice } from "./python-bridge";
import { generateRecoveryPaymentLink } from "./razorpay.service";
import { log } from "./audit.service";

/**
 * The Recovery Engine — the core of the hackathon project.
 * This function:
 *  1. Takes a failed transaction
 *  2. Gets AI decision from Python engine
 *  3. Executes the recovery action (generates Razorpay link)
 *  4. Logs everything to the audit trail
 */
export async function executeRecovery(transactionId: string): Promise<void> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { customer: true },
  });

  if (!transaction) {
    console.error(`[Recovery Engine] Transaction ${transactionId} not found`);
    return;
  }

  // STOPPING RULE: Don't recover what's already recovered
  if (transaction.status === "RECOVERED") {
    console.log(
      `[Recovery Engine] Transaction ${transactionId} already recovered. Skipping.`,
    );
    return;
  }

  // STOPPING RULE: Max 3 retry attempts per transaction
  if (transaction.retryCount >= 3) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "ABANDONED" },
    });
    await log(
      "MAX_RETRIES_REACHED",
      "SYSTEM",
      { retryCount: transaction.retryCount },
      transactionId,
    );
    return;
  }

  await log(
    "RECOVERY_ENGINE_STARTED",
    "AI_AGENT",
    { transactionId },
    transactionId,
  );

  // Step 1: Get AI Decision from Python engine
  const aiDecision = await getAIDecision({
    transactionId: transaction.id,
    customerId: transaction.customerId,
    customerName: transaction.customer.name,
    customerEmail: transaction.customer.email,
    customerPhone: transaction.customer.phone || undefined,
    customerType: transaction.customer.type as "B2C" | "B2B",
    amount: transaction.amount,
    failureType: transaction.failureType,
    errorCode: transaction.errorCode || undefined,
    errorDescription: transaction.errorDescription || undefined,
    retryCount: transaction.retryCount,
    cartItems: transaction.cartItems as object[] | undefined,
    invoiceDueDate: transaction.invoiceDueDate?.toISOString(),
    subscriptionId: transaction.subscriptionId || undefined,
  });

  await log(
    "AI_DECISION_MADE",
    "AI_AGENT",
    { decision: aiDecision },
    transactionId,
  );

  // Step 2: Execute based on action type
  const actionType = aiDecision.action as ActionType;

  if (actionType === "NO_ACTION") {
    await prisma.recoveryAction.create({
      data: {
        transactionId,
        actionType: "NO_ACTION",
        status: "COMPLETED",
        aiRootCause: aiDecision.rootCause,
        aiReasoning: aiDecision.reasoning,
        aiConfidence: aiDecision.confidence,
        recoveryProb: aiDecision.recoveryProbability,
        executedAt: new Date(),
      },
    });
    await log(
      "NO_ACTION_TAKEN",
      "AI_AGENT",
      { reason: aiDecision.reasoning },
      transactionId,
    );
    return;
  }

  // Step 3: Generate Razorpay Payment Link (for most action types)
  let paymentLinkUrl: string | undefined;
  let paymentLinkId: string | undefined;

  const needsPaymentLink = ![
    "B2B_ESCALATION_EMAIL",
    "NO_ACTION",
    "PROMISE_TO_PAY_FOLLOWUP",
  ].includes(actionType);

  if (needsPaymentLink) {
    const amountWithDiscount = aiDecision.discountPercent
      ? transaction.amount * (1 - aiDecision.discountPercent / 100)
      : transaction.amount;

    const description = buildPaymentLinkDescription(
      transaction.failureType,
      aiDecision.discountPercent,
    );

    try {
      const link = await generateRecoveryPaymentLink({
        amount: Math.round(amountWithDiscount * 100), // convert to paise
        customerName: transaction.customer.name,
        customerEmail: transaction.customer.email,
        customerPhone: transaction.customer.phone || undefined,
        description,
        referenceId: transaction.id,
        // Link expires in 24 hours
        expireBy: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      });

      paymentLinkUrl = link.short_url;
      paymentLinkId = link.id;

      await log(
        "PAYMENT_LINK_GENERATED",
        "AI_AGENT",
        { linkId: link.id, url: link.short_url, amount: amountWithDiscount },
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

  // Step 4: Generate Hinglish Voice if needed (high-value transactions)
  let voiceAudioPath: string | undefined;

  if (actionType === "HINGLISH_VOICE_CALL" && paymentLinkUrl) {
    const voice = await generateHinglishVoice(
      transaction.customer.name,
      transaction.amount,
      paymentLinkUrl,
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

  // Step 5: Simulate email/SMS sending (mock — log as sent)
  const now = new Date();
  const scheduledFor = aiDecision.scheduledDelay
    ? new Date(now.getTime() + aiDecision.scheduledDelay * 60 * 1000)
    : now;

  // Step 6: Save recovery action to DB
  await prisma.recoveryAction.create({
    data: {
      transactionId,
      actionType,
      status: aiDecision.scheduledDelay ? "SCHEDULED" : "COMPLETED",
      aiRootCause: aiDecision.rootCause,
      aiReasoning: aiDecision.reasoning,
      aiConfidence: aiDecision.confidence,
      recoveryProb: aiDecision.recoveryProbability,
      paymentLinkUrl,
      paymentLinkId,
      emailSentAt:
        needsPaymentLink && !aiDecision.scheduledDelay ? now : undefined,
      voiceAudioPath,
      scheduledFor,
      executedAt: aiDecision.scheduledDelay ? undefined : now,
    },
  });

  // Step 7: Update transaction status and retry count
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: "IN_RECOVERY",
      retryCount: transaction.retryCount + 1,
      promisedPayDate: aiDecision.promisedPayDate
        ? new Date(aiDecision.promisedPayDate)
        : undefined,
    },
  });

  await log(
    "RECOVERY_ACTION_EXECUTED",
    "AI_AGENT",
    {
      actionType,
      paymentLinkUrl,
      scheduledFor,
      recoveryProbability: aiDecision.recoveryProbability,
    },
    transactionId,
  );

  console.log(
    `✅ [Recovery Engine] ${actionType} executed for txn ${transactionId} | P(recover)=${aiDecision.recoveryProbability}`,
  );
}

/**
 * Run recovery on an entire batch of failed transactions.
 * This is what shows "measured money recovered across a batch" for the hackathon.
 */
export async function runBatchRecovery(): Promise<{
  processed: number;
  totalAtRisk: number;
  batchId: string;
}> {
  // Find all transactions eligible for recovery
  const failedTransactions = await prisma.transaction.findMany({
    where: { status: "FAILED", retryCount: { lt: 3 } },
  });

  if (failedTransactions.length === 0) {
    return { processed: 0, totalAtRisk: 0, batchId: "none" };
  }

  const totalAtRisk = failedTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Create a batch record
  const batch = await prisma.recoveryBatch.create({
    data: {
      totalAtRisk,
      transactionCount: failedTransactions.length,
    },
  });

  await log("BATCH_RECOVERY_STARTED", "AI_AGENT", {
    batchId: batch.id,
    transactionCount: failedTransactions.length,
    totalAtRisk,
  });

  // Process each transaction
  for (const txn of failedTransactions) {
    await executeRecovery(txn.id);
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await prisma.recoveryBatch.update({
    where: { id: batch.id },
    data: { completedAt: new Date(), status: "COMPLETED" },
  });

  await log("BATCH_RECOVERY_COMPLETED", "AI_AGENT", {
    batchId: batch.id,
    processed: failedTransactions.length,
  });

  return {
    processed: failedTransactions.length,
    totalAtRisk,
    batchId: batch.id,
  };
}

function buildPaymentLinkDescription(
  failureType: string,
  discount?: number,
): string {
  const descriptions: Record<string, string> = {
    PAYMENT_FAILED: "Complete your pending payment",
    CHECKOUT_ABANDONED: "Your cart is waiting! Complete your purchase",
    SUBSCRIPTION_FAILED: "Renew your subscription",
    INVOICE_OVERDUE: "Settle your overdue invoice",
    MANDATE_FAILED: "Retry your auto-debit",
  };
  const base = descriptions[failureType] || "Complete your payment";
  return discount ? `${base} — ${discount}% discount applied!` : base;
}
