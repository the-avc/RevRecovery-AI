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
 * Generates a Razorpay Payment Link for recovery (mocked when keys are absent).
 */
export function generateRecoveryPaymentLink(
  opts: PaymentLinkOptions,
): Promise<{ id: string; short_url: string; amount: number }> {
  if (!process.env.RAZORPAY_KEY_ID) {
    const id = `mock_plink_${Date.now()}`; // MOCK mode for dev without keys
    console.log(`[MOCK] Payment link for ${opts.customerEmail} - Rs.${opts.amount / 100}`);
    return Promise.resolve({ id, short_url: `https://rzp.io/l/${id}`, amount: opts.amount });
  }
  return razorpay.paymentLink
    .create({
      amount: opts.amount,
      currency: opts.currency || "INR",
      accept_partial: false,
      description: opts.description,
      customer: {
        name: opts.customerName,
        email: opts.customerEmail,
        ...(opts.customerPhone?.trim() ? { contact: opts.customerPhone.trim() } : {}),
      },
      notify: { sms: Boolean(opts.customerPhone?.trim()), email: true },
      reminder_enable: true,
      expire_by: opts.expireBy || Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      reference_id: opts.referenceId,
    } as never)
    .then((link: any) => ({ id: link.id, short_url: link.short_url, amount: link.amount }));
}

/**
 * Verifies Razorpay webhook or payment signature (timing-safe).
 */
export function verifyWebhookSignature(body: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

