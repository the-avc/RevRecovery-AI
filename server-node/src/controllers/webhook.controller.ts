import { Request, Response } from "express";
import { prisma } from "../services/db";
import { verifyWebhookSignature } from "../services/razorpay.service";
import { log } from "../services/audit.service";
import { executeRecovery } from "../services/recovery-engine";

// Email is @unique — upsert is atomic, no race condition on concurrent webhooks.
async function findOrCreateCustomer(
  email: string,
  data: {
    name: string;
    phone?: string;
    type?: "B2B" | "B2C";
    company?: string;
  },
) {
  return prisma.customer.upsert({
    where: { email },
    update: {
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.company ? { company: data.company, type: data.type } : {}),
    },
    create: { email, ...data },
  });
}

/**
 * Razorpay webhooks -- the "ears" of the system. Always 200 fast, process async after.
 */
export async function handleRazorpayWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
    ? req.body
    : JSON.stringify(req.body || {});
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret) {
    if (process.env.NODE_ENV !== "development") {
      await log("WEBHOOK_SECRET_MISSING", "RAZORPAY_WEBHOOK", {});
      return void res.status(500).json({ error: "Webhook secret not configured" });
    }
    console.warn("[Webhook] ⚠️ No secret — accepting unverified in dev mode");
  } else if (
    !verifyWebhookSignature(
      rawBody,
      (req.headers["x-razorpay-signature"] as string) || "",
      secret,
    )
  ) {
    await log("WEBHOOK_SIGNATURE_INVALID", "RAZORPAY_WEBHOOK", {});
    return void res.status(400).json({ error: "Invalid signature" });
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return void res.status(400).json({ error: "Invalid JSON body" });
  }
  const event = payload?.event as string;
  await log("WEBHOOK_RECEIVED", "RAZORPAY_WEBHOOK", { event });
  res.status(200).json({ received: true }); // respond within Razorpay's 5s window
  setImmediate(() => {
    (async () => {
      try {
        await HANDLERS[event]?.(payload);
        if (!HANDLERS[event]) console.log(`[Webhook] Unhandled event: ${event}`);
      } catch (err) {
        await log("WEBHOOK_PROCESSING_ERROR", "RAZORPAY_WEBHOOK", {
          error: String(err),
          event,
        }).catch(() => {});
      }
    })().catch((err) => console.error("[Webhook] Unhandled processing error:", err));
  });
}

const HANDLERS: Record<string, (p: any) => Promise<void>> = {
  "payment.failed": (p) => handlePaymentFailed(p.payload.payment?.entity),
  "payment.captured": (p) =>
    handlePaymentSucceeded(
      p.payload.payment?.entity,
      p.payload.payment_link?.entity,
      p.payload.invoice?.entity,
      p.payload.subscription?.entity,
    ),
  "payment_link.paid": (p) =>
    handlePaymentSucceeded(
      p.payload.payment?.entity,
      p.payload.payment_link?.entity,
      p.payload.invoice?.entity,
      p.payload.subscription?.entity,
    ),
  "order.paid": (p) =>
    handlePaymentSucceeded(
      p.payload.payment?.entity,
      p.payload.payment_link?.entity,
      p.payload.invoice?.entity,
      p.payload.subscription?.entity,
    ),
  "invoice.paid": (p) =>
    handlePaymentSucceeded(
      p.payload.payment?.entity,
      p.payload.payment_link?.entity,
      p.payload.invoice?.entity,
      p.payload.subscription?.entity,
    ),
  "subscription.charged": (p) =>
    handlePaymentSucceeded(
      p.payload.payment?.entity,
      p.payload.payment_link?.entity,
      p.payload.invoice?.entity,
      p.payload.subscription?.entity,
    ),
  "subscription.charged.failed": (p) =>
    handleSubscriptionFailed(p.payload.subscription?.entity),
  "invoice.expired": (p) => handleInvoiceExpired(p.payload.invoice?.entity),
};

/** Payment failed -- create a failed transaction and trigger AI recovery */
async function handlePaymentFailed(payment: any): Promise<void> {
  // Idempotency: Razorpay retries webhooks -- never log the same payment twice.
  if (
    payment?.id &&
    (await prisma.transaction.findFirst({
      where: { razorpayPaymentId: payment.id },
    }))
  )
    return;
  const customer = await findOrCreateCustomer(
    payment?.email || `unknown_${payment?.id || Date.now()}@recovery.local`,
    {
      name:
        payment?.notes?.customer_name || payment?.contact || "Unknown Customer",
      phone:
        typeof payment?.contact === "string" && payment.contact.length >= 10
          ? payment.contact
          : undefined,
    },
  );

  const transaction = await prisma.transaction.create({
    data: {
      customerId: customer.id,
      razorpayPaymentId: payment?.id,
      razorpayOrderId: payment?.order_id,
      amount: (payment?.amount || 0) / 100,
      failureType: "PAYMENT_FAILED",
      errorCode: payment?.error_code || "UNKNOWN",
      errorDescription: payment?.error_description,
      status: "FAILED",
    },
  });

  await log(
    "PAYMENT_FAILED_LOGGED",
    "RAZORPAY_WEBHOOK",
    {
      paymentId: payment?.id,
      amount: (payment?.amount || 0) / 100,
      errorCode: payment?.error_code,
    },
    transaction.id,
  );

  await executeRecovery(transaction.id);
}

/** Payment succeeded -- STOPPING RULE: mark recovered and cancel all pending recovery actions */
async function handlePaymentSucceeded(
  payment?: any,
  paymentLink?: any,
  invoice?: any,
  subscription?: any,
): Promise<void> {
  const paymentId = payment?.id;
  const orderId = payment?.order_id;
  const linkId = paymentLink?.id;
  const refId =
    paymentLink?.reference_id ||
    payment?.notes?.reference_id ||
    payment?.notes?.transaction_id;
  const invoiceId = invoice?.id || payment?.invoice_id;
  const subscriptionId = subscription?.id || payment?.subscription_id;

  const conditions: Array<Record<string, string>> = [];
  if (paymentId) conditions.push({ razorpayPaymentId: paymentId });
  if (orderId) conditions.push({ razorpayOrderId: orderId });
  if (linkId) conditions.push({ razorpayLinkId: linkId });
  if (refId) conditions.push({ id: refId });
  if (invoiceId) conditions.push({ invoiceId });
  if (subscriptionId) conditions.push({ subscriptionId });

  if (conditions.length === 0) {
    await log("PAYMENT_SUCCESS_NO_MATCH", "RAZORPAY_WEBHOOK", {
      paymentId,
      linkId,
      invoiceId,
      subscriptionId,
    });
    return;
  }

  const transaction = await prisma.transaction.findFirst({
    where: { OR: conditions },
  });

  if (!transaction) {
    await log("PAYMENT_SUCCESS_NO_MATCH", "RAZORPAY_WEBHOOK", {
      paymentId,
      linkId,
      refId,
      invoiceId,
      subscriptionId,
    });
    return;
  }

  // Idempotency: skip if already recovered to avoid duplicate metrics/logs
  if (transaction.status === "RECOVERED") return;

  const amountPaise =
    payment?.amount ?? paymentLink?.amount_paid ?? paymentLink?.amount ?? invoice?.amount_paid ?? invoice?.amount ?? 0;
  const recoveredAmount =
    amountPaise > 0 ? amountPaise / 100 : transaction.amount;

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: "RECOVERED",
      recoveredAmount,
      recoveredAt: new Date(),
      razorpayPaymentId: paymentId || transaction.razorpayPaymentId,
      razorpayOrderId: orderId || transaction.razorpayOrderId,
      razorpayLinkId: linkId || transaction.razorpayLinkId,
    },
  });

  // STOPPING RULE: Cancel all pending recovery actions
  const cancelled = await prisma.recoveryAction.updateMany({
    where: {
      transactionId: transaction.id,
      status: { in: ["PENDING", "SCHEDULED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "Payment received -- stopping recovery",
    },
  });

  await log(
    "PAYMENT_RECOVERED",
    "RAZORPAY_WEBHOOK",
    {
      paymentId,
      amount: recoveredAmount,
      cancelledActions: cancelled.count,
    },
    transaction.id,
  );

  console.log(
    `[Webhook] RECOVERED Rs.${recoveredAmount} txn ${transaction.id} | cancelled ${cancelled.count}`,
  );
}

/** Subscription charge failed -- trigger mandate retry sequencer */
async function handleSubscriptionFailed(subscription: any): Promise<void> {
  if (
    subscription?.id &&
    (await prisma.transaction.findFirst({
      where: { subscriptionId: subscription.id, status: "FAILED" },
    }))
  )
    return;

  const customer = await findOrCreateCustomer(
    subscription?.email || `sub_${subscription?.id || Date.now()}@recovery.local`,
    { name: "Subscriber" },
  );

  const transaction = await prisma.transaction.create({
    data: {
      customerId: customer.id,
      subscriptionId: subscription?.id,
      amount: (subscription?.charge_amount || 0) / 100,
      failureType: "SUBSCRIPTION_FAILED",
      errorCode: "SUBSCRIPTION_CHARGE_FAILED",
      status: "FAILED",
    },
  });

  await log(
    "SUBSCRIPTION_FAILURE_LOGGED",
    "RAZORPAY_WEBHOOK",
    { subscriptionId: subscription?.id },
    transaction.id,
  );
  await executeRecovery(transaction.id);
}

/** B2B Invoice expired -- trigger receivables chaser */
async function handleInvoiceExpired(invoice: any): Promise<void> {
  if (
    invoice?.id &&
    (await prisma.transaction.findFirst({
      where: { invoiceId: invoice.id },
    }))
  )
    return;

  const details = invoice?.customer_details;
  const customer = await findOrCreateCustomer(
    details?.email || `b2b_${invoice?.id || Date.now()}@recovery.local`,
    {
      name: details?.name || "Business Client",
      phone: details?.contact,
      type: "B2B",
      company: details?.name,
    },
  );

  const transaction = await prisma.transaction.create({
    data: {
      customerId: customer.id,
      invoiceId: invoice?.id,
      amount: (invoice?.amount || 0) / 100,
      failureType: "INVOICE_OVERDUE",
      errorCode: "INVOICE_EXPIRED",
      status: "FAILED",
      invoiceDueDate: invoice?.due_date
        ? new Date(invoice.due_date * 1000)
        : undefined,
    },
  });

  await log(
    "INVOICE_OVERDUE_LOGGED",
    "RAZORPAY_WEBHOOK",
    { invoiceId: invoice?.id },
    transaction.id,
  );
  await executeRecovery(transaction.id);
}
