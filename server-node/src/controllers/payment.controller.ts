import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../services/db";
import { razorpay } from "../services/razorpay.service";

/** POST /api/payment/create-order — Creates a Razorpay order for checkout */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { amount, receipt } = req.body;

    if (!amount || amount < 100) {
      res
        .status(400)
        .json({ success: false, error: "Amount must be at least 100 paise." });
      return;
    }

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: receipt || `receipt_${Date.now()}`,
    });

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
};

/** POST /api/payment/verify-payment — Verifies signature and marks transaction recovered */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      transactionId,
      amount,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res
        .status(400)
        .json({ success: false, error: "Missing required payment fields." });
      return;
    }

    // Verify Razorpay signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      res
        .status(400)
        .json({ success: false, error: "Invalid payment signature." });
      return;
    }

    // Mark transaction as recovered if a transactionId was provided
    if (transactionId) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: "RECOVERED",
          recoveredAmount: amount ? amount / 100 : undefined,
          recoveredAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          transactionId,
          event: "PAYMENT_RECOVERED",
          actor: "USER",
          details: { razorpay_payment_id, razorpay_order_id },
        },
      });
    }

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Error verifying Razorpay payment:", error);
    res.status(500).json({ success: false, error: "Failed to verify payment" });
  }
};
