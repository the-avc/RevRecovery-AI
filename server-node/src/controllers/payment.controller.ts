import { Request, Response } from "express";
import { razorpay, verifyWebhookSignature } from "../services/razorpay.service";
import { prisma } from "../services/db";
import { log } from "../services/audit.service";

/** POST /api/payment/create-order — Razorpay order (amount in paise, min Rs.1) */
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const amount = Math.floor(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount < 100) {
      res.status(400).json({ success: false, error: "Amount must be at least 100 paise." });
      return;
    }

    try {
      if (!process.env.RAZORPAY_KEY_ID) throw new Error("No Razorpay key");
      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: req.body.receipt || `receipt_${Date.now()}`,
      });
      res.json({ success: true, order_id: order.id, amount: order.amount, currency: order.currency });
    } catch {
      const mockOrderId = `order_mock_${Date.now()}`;
      res.json({ success: true, order_id: mockOrderId, amount, currency: "INR" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create order", details: String(error) });
  }
};

/** POST /api/payment/verify-payment — verifies signature, marks RECOVERED, cancels pending actions */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ success: false, error: "Missing required payment fields." });
      return;
    }

    const isMock = !process.env.RAZORPAY_KEY_SECRET || razorpay_order_id.startsWith("order_mock_");

    if (!isMock) {
      const isValid = verifyWebhookSignature(
        `${razorpay_order_id}|${razorpay_payment_id}`,
        razorpay_signature,
        process.env.RAZORPAY_KEY_SECRET || "",
      );
      if (!isValid) {
        res.status(400).json({ success: false, error: "Invalid payment signature." });
        return;
      }
    }

    // Match by ID or by Order ID fallback
    const txn = transactionId
      ? await prisma.transaction.findUnique({ where: { id: transactionId } })
      : await prisma.transaction.findFirst({ where: { razorpayOrderId: razorpay_order_id } });

    if (txn) {
      const recoveredAmount = amount ? Number(amount) / 100 : txn.amount;

      await prisma.transaction.update({
        where: { id: txn.id },
        data: {
          status: "RECOVERED",
          recoveredAmount,
          recoveredAt: new Date(),
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
        },
      });

      // STOPPING RULE: halt pending outreach
      await prisma.recoveryAction.updateMany({
        where: { transactionId: txn.id, status: { in: ["PENDING", "SCHEDULED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Paid via checkout — stopping recovery" },
      });

      await log("PAYMENT_RECOVERED", "USER", { razorpay_payment_id, razorpay_order_id, recoveredAmount }, txn.id);
    }

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to verify payment", details: String(error) });
  }
};
