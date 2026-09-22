import { Request, Response } from "express";
import crypto from "crypto";
import { FailureType, CustomerType, TransactionStatus } from "@prisma/client";
import { prisma } from "../services/db";
import { log } from "../services/audit.service";

const INDIAN_NAMES = [
  "Rajesh Kumar",
  "Priya Sharma",
  "Amit Singh",
  "Sunita Patel",
  "Vikram Nair",
  "Anjali Mehta",
  "Suresh Gupta",
  "Pooja Iyer",
  "Ravi Verma",
  "Neha Joshi",
  "Arun Rao",
  "Kavita Shah",
  "Manish Yadav",
  "Deepa Pillai",
  "Sanjay Tiwari",
];

const COMPANIES = [
  "Infosys Ltd",
  "TechMahindra Pvt Ltd",
  "Wipro Solutions",
  "HCL Technologies",
  "Reliance Digital",
  "TATA Consultancy Services",
  "Flipkart Pvt Ltd",
];

const ERROR_SCENARIOS: Array<{
  code: string;
  desc: string;
  failureType: FailureType;
}> = [
  {
    code: "BAD_REQUEST_ERROR",
    desc: "Bank declined the payment",
    failureType: "PAYMENT_FAILED",
  },
  {
    code: "GATEWAY_ERROR",
    desc: "Bank network timed out",
    failureType: "PAYMENT_FAILED",
  },
  {
    code: "SERVER_ERROR",
    desc: "Payment processor unavailable",
    failureType: "PAYMENT_FAILED",
  },
  {
    code: "INSUFFICIENT_FUNDS",
    desc: "Customer has insufficient funds",
    failureType: "PAYMENT_FAILED",
  },
  {
    code: "CARD_EXPIRED",
    desc: "Customer card is expired",
    failureType: "PAYMENT_FAILED",
  },
  {
    code: "CHECKOUT_ABANDONED",
    desc: "Customer left before completing payment",
    failureType: "CHECKOUT_ABANDONED",
  },
  {
    code: "SUBSCRIPTION_CHARGE_FAILED",
    desc: "Monthly subscription charge failed",
    failureType: "SUBSCRIPTION_FAILED",
  },
  {
    code: "INVOICE_EXPIRED",
    desc: "B2B invoice past due date",
    failureType: "INVOICE_OVERDUE",
  },
  {
    code: "MANDATE_DEBIT_FAILED",
    desc: "Auto-debit mandate failed",
    failureType: "MANDATE_FAILED",
  },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

/**
 * POST /api/seed/generate
 * Generates 50 realistic failed transactions covering all failure scenarios
 */
export async function generateMockData(
  req: Request,
  res: Response,
): Promise<void> {
  const count = parseInt(req.query.count as string) || 50;

  await log("SEED_STARTED", "USER", { count });

  // Clean old mock data in parallel (order doesn't matter since we delete everything)
  await Promise.all([
    prisma.auditLog.deleteMany({}),
    prisma.recoveryAction.deleteMany({}),
    prisma.recoveryBatch.deleteMany({}),
  ]);
  await prisma.transaction.deleteMany({});
  await prisma.customer.deleteMany({});

  const customersData = [];
  const transactionsData = [];
  for (let i = 0; i < count; i++) {
    const isB2B = Math.random() < 0.2; // 20% B2B transactions
    const name = isB2B
      ? `${randomFrom(COMPANIES)} Procurement`
      : randomFrom(INDIAN_NAMES);
    const email = `${name
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z.]/g, "")}_${i}@example.com`;
    const customerId = crypto.randomUUID();

    customersData.push({
      id: customerId,
      name,
      email,
      phone: `+91${9000000000 + i}`,
      type: isB2B ? CustomerType.B2B : CustomerType.B2C,
      company: isB2B ? name : null,
    });

    const scenario = randomFrom(ERROR_SCENARIOS);
    const isInvoice = scenario.failureType === "INVOICE_OVERDUE";

    // B2B invoices have higher amounts
    const amount = isB2B
      ? randomAmount(5000, 500000)
      : isInvoice
        ? randomAmount(1000, 50000)
        : randomAmount(99, 9999);

    transactionsData.push({
      id: crypto.randomUUID(),
      customerId,
      razorpayPaymentId: `pay_mock_${Date.now()}_${i}`,
      amount,
      failureType: scenario.failureType,
      errorCode: scenario.code,
      errorDescription: scenario.desc,
      status: TransactionStatus.FAILED,
      invoiceDueDate: isInvoice
        ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // 0-30 days overdue
        : undefined,
      cartItems:
        scenario.failureType === "CHECKOUT_ABANDONED"
          ? [
              { name: "Product A", price: amount * 0.6, qty: 1 },
              { name: "Product B", price: amount * 0.4, qty: 2 },
            ]
          : undefined,
      subscriptionId:
        scenario.failureType === "SUBSCRIPTION_FAILED"
          ? `sub_mock_${i}`
          : undefined,
    });
  }

  await prisma.customer.createMany({ data: customersData });
  await prisma.transaction.createMany({ data: transactionsData });

  await log("SEED_COMPLETED", "USER", { created: transactionsData.length });

  res.json({
    success: true,
    message: `Created ${transactionsData.length} mock failed transactions covering all failure scenarios`,
    breakdown: {
      payment_failed: transactionsData.filter(
        (t) => t.failureType === "PAYMENT_FAILED",
      ).length,
      checkout_abandoned: transactionsData.filter(
        (t) => t.failureType === "CHECKOUT_ABANDONED",
      ).length,
      subscription_failed: transactionsData.filter(
        (t) => t.failureType === "SUBSCRIPTION_FAILED",
      ).length,
      invoice_overdue: transactionsData.filter(
        (t) => t.failureType === "INVOICE_OVERDUE",
      ).length,
      mandate_failed: transactionsData.filter(
        (t) => t.failureType === "MANDATE_FAILED",
      ).length,
    },
  });
}
