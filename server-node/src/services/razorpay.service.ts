import Razorpay from "razorpay";
import crypto from "crypto";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn(
    "⚠️  Razorpay keys not configured. Payment link generation will be mocked.",
  );
}

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export interface PaymentLinkOptions {
  amount: number; // in paise (INR * 100)
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description: string;
  currency?: string;
  expireBy?: number; // Unix timestamp - stopping rule
  referenceId?: string;
}

/**
 * Generates a Razorpay Payment Link for recovery
 * This is the core Razorpay integration that actually creates a "re-try" link
 */
export async function generateRecoveryPaymentLink(
  opts: PaymentLinkOptions,
): Promise<{
  id: string;
  short_url: string;
  amount: number;
}> {
  if (!process.env.RAZORPAY_KEY_ID) {
    // Mock mode for development without keys
    console.log(
      `[MOCK] Would generate Razorpay payment link for ${opts.customerEmail} - ₹${opts.amount / 100}`,
    );
    return {
      id: `mock_plink_${Date.now()}`,
      short_url: `https://rzp.io/l/mock_${Date.now()}`,
      amount: opts.amount,
    };
  }

  const linkData = {
    amount: opts.amount,
    currency: opts.currency || "INR",
    accept_partial: false,
    description: opts.description,
    customer: {
      name: opts.customerName,
      email: opts.customerEmail,
      contact: opts.customerPhone || "",
    },
    notify: {
      sms: !!opts.customerPhone,
      email: true,
    },
    reminder_enable: true,
    expire_by: opts.expireBy || Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    reference_id: opts.referenceId,
  };

  const link = await razorpay.paymentLink.create(linkData as any);
  return {
    id: link.id as string,
    short_url: link.short_url as string,
    amount: link.amount as number,
  };
}

/**
 * Verifies Razorpay webhook signature to ensure authenticity
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return expectedSignature === signature;
}
