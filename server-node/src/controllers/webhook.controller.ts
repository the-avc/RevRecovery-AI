import { Request, Response } from "express";
import { prisma } from "../services/db";
import { verifyWebhookSignature } from "../services/razorpay.service";
import { log } from "../services/audit.service";
import { executeRecovery } from "../services/recovery-engine";

// Shared helper: find existing customer by email or create a new one
async function findOrCreateCustomer(
  email: string,
  data: {
    name: string;
    phone?: string;
    type?: "B2B" | "B2C";
    company?: string;
  },
) {
  return (
    (await prisma.customer.findFirst({ where: { email } })) ||
    (await prisma.customer.create({ data: { email, ...data } }))
  );
}

/**
 * Handles all Razorpay webhook events.
 * This is the "ears" of the system — listening for payments failing or succeeding.
 */
export async function handleRazorpayWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.headers["x-razorpay-signature"] as string;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const rawBody = req.body.toString("utf8");

  // Verify webhook authenticity
  if (secret && !verifyWebhookSignature(rawBody, signature, secret)) {
    await log("WEBHOOK_SIGNATURE_INVALID", "RAZORPAY_WEBHOOK", { signature });
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (parseErr) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  const event = payload?.event as string;

  await log("WEBHOOK_RECEIVED", "RAZORPAY_WEBHOOK", {
    event,
    entity: payload.payload,
  });

  // Always respond quickly to Razorpay (within 5 seconds)
  res.status(200).json({ received: true });

  // Process asynchronously after responding
  setImmediate(async () => {
    try {
      await processWebhookEvent(event, payload);
    } catch (err) {
      await log("WEBHOOK_PROCESSING_ERROR", "RAZORPAY_WEBHOOK", {
        error: String(err),
        event,
      });
    }
  });
}

const WEBHOOK_EVENT_HANDLERS: Record<string, (payload: any) => Promise<void>> =
  {
    "payment.failed": (payload) =>
      handlePaymentFailed(payload.payload.payment.entity),
    "payment.captured": (payload) =>
      handlePaymentSucceeded(
        payload.payload.payment?.entity || payload.payload.payment_link?.entity,
      ),
    "payment_link.paid": (payload) =>
      handlePaymentSucceeded(
        payload.payload.payment?.entity || payload.payload.payment_link?.entity,
      ),
    "subscription.charged.failed": (payload) =>
      handleSubscriptionFailed(payload.payload.subscription.entity),
    "invoice.expired": (payload) =>
      handleInvoiceExpired(payload.payload.invoice.entity),
  };

async function processWebhookEvent(event: string, payload: any): Promise<void> {
  const handler = WEBHOOK_EVENT_HANDLERS[event];
  if (handler) await handler(payload);
  else console.log(`[Webhook] Unhandled event: ${event}`);
}

/** Payment failed — create a failed transaction and trigger AI recovery */
async function handlePaymentFailed(payment: any): Promise<void> {
  const customer = await findOrCreateCustomer(
    payment.email || `unknown_${Date.now()}@recovery.local`,
    {
      name: payment.contact || "Unknown Customer",
      phone: payment.contact,
    },
  );

  const transaction = await prisma.transaction.create({
    data: {
      customerId: customer.id,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amount: payment.amount / 100,
      failureType: "PAYMENT_FAILED",
      errorCode: payment.error_code,
      errorDescription: payment.error_description,
      status: "FAILED",
    },
  });

  await log(
    "PAYMENT_FAILED_LOGGED",
    "RAZORPAY_WEBHOOK",
    {
      paymentId: payment.id,
      amount: payment.amount / 100,
      errorCode: payment.error_code,
    },
    transaction.id,
  );

  await executeRecovery(transaction.id);
}

/** Payment succeeded — STOPPING RULE: mark recovered and cancel all pending recovery actions */
async function handlePaymentSucceeded(payment: any): Promise<void> {
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [
        { razorpayPaymentId: payment.id },
        { razorpayOrderId: payment.order_id },
        { id: payment.reference_id },
      ],
    },
  });

  if (!transaction) {
    await log("PAYMENT_SUCCESS_NO_MATCH", "RAZORPAY_WEBHOOK", {
      paymentId: payment.id,
    });
    return;
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: "RECOVERED",
      recoveredAmount: payment.amount / 100,
      recoveredAt: new Date(),
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
      cancelReason: "Payment received — stopping recovery",
    },
  });

  await log(
    "PAYMENT_RECOVERED",
    "RAZORPAY_WEBHOOK",
    {
      paymentId: payment.id,
      amount: payment.amount / 100,
      cancelledActions: cancelled.count,
    },
    transaction.id,
  );

  console.log(
    `💰 [Webhook] RECOVERED ₹${payment.amount / 100} for txn ${transaction.id} | Cancelled ${cancelled.count} pending actions`,
  );
}

/** Subscription charge failed — trigger mandate retry sequencer */
async function handleSubscriptionFailed(subscription: any): Promise<void> {
  const customer = await findOrCreateCustomer(
    subscription.email || `sub_${Date.now()}@recovery.local`,
    { name: "Subscriber" },
  );

  const transaction = await prisma.transaction.create({
    data: {
      customerId: customer.id,
      subscriptionId: subscription.id,
      amount: subscription.charge_amount / 100,
      failureType: "SUBSCRIPTION_FAILED",
      errorCode: "SUBSCRIPTION_CHARGE_FAILED",
      status: "FAILED",
    },
  });

  await log(
    "SUBSCRIPTION_FAILURE_LOGGED",
    "RAZORPAY_WEBHOOK",
    { subscriptionId: subscription.id },
    transaction.id,
  );
  await executeRecovery(transaction.id);
}

/** B2B Invoice expired — trigger receivables chaser */
async function handleInvoiceExpired(invoice: any): Promise<void> {
  const details = invoice.customer_details;
  const customer = await findOrCreateCustomer(
    details?.email || `b2b_${Date.now()}@recovery.local`,
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
      invoiceId: invoice.id,
      amount: invoice.amount / 100,
      failureType: "INVOICE_OVERDUE",
      errorCode: "INVOICE_EXPIRED",
      status: "FAILED",
      invoiceDueDate: invoice.due_date
        ? new Date(invoice.due_date * 1000)
        : undefined,
    },
  });

  await log(
    "INVOICE_OVERDUE_LOGGED",
    "RAZORPAY_WEBHOOK",
    { invoiceId: invoice.id },
    transaction.id,
  );
  await executeRecovery(transaction.id);
}
