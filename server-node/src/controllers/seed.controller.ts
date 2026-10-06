import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { FailureType, CustomerType, TransactionStatus } from "@prisma/client";
import { prisma } from "../services/db";
import { log } from "../services/audit.service";

const NAMES = ["Rajesh Kumar","Priya Sharma","Amit Singh","Sunita Patel","Vikram Nair","Anjali Mehta","Suresh Gupta","Pooja Iyer","Ravi Verma","Neha Joshi","Arun Rao","Kavita Shah","Manish Yadav","Deepa Pillai","Sanjay Tiwari"];
const COMPANIES = ["Infosys Ltd","TechMahindra Pvt Ltd","Wipro Solutions","HCL Technologies","Reliance Digital","TATA Consultancy Services","Flipkart Pvt Ltd"];

const SCENARIOS: Array<{ code: string; desc: string; failureType: FailureType }> = [
  { code: "BAD_REQUEST_ERROR", desc: "Bank declined the payment", failureType: "PAYMENT_FAILED" },
  { code: "GATEWAY_ERROR", desc: "Bank network timed out", failureType: "PAYMENT_FAILED" },
  { code: "SERVER_ERROR", desc: "Payment processor unavailable", failureType: "PAYMENT_FAILED" },
  { code: "INSUFFICIENT_FUNDS", desc: "Customer has insufficient funds", failureType: "PAYMENT_FAILED" },
  { code: "CARD_EXPIRED", desc: "Customer card is expired", failureType: "PAYMENT_FAILED" },
  { code: "CHECKOUT_ABANDONED", desc: "Customer left before completing payment", failureType: "CHECKOUT_ABANDONED" },
  { code: "SUBSCRIPTION_CHARGE_FAILED", desc: "Monthly subscription charge failed", failureType: "SUBSCRIPTION_FAILED" },
  { code: "INVOICE_EXPIRED", desc: "B2B invoice past due date", failureType: "INVOICE_OVERDUE" },
  { code: "MANDATE_DEBIT_FAILED", desc: "Auto-debit mandate failed", failureType: "MANDATE_FAILED" },
  { code: "SUSPECTED_FRAUD", desc: "Flagged for anomalous fraud pattern", failureType: "PAYMENT_FAILED" },
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const amt = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100;

const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) return "";
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0]);
  return [headers.map(esc).join(","), ...rows.map((r) => headers.map((k) => esc(r[k])).join(","))].join("\r\n");
};

const getExportsDir = () => {
  const dir = path.resolve(process.cwd(), fs.existsSync("server-node") ? "server-node/exports" : "exports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** POST /api/seed/generate — N realistic failed transactions covering all scenarios */
export async function generateMockData(req: Request, res: Response): Promise<void> {
  const count = Math.min(500, Math.max(1, parseInt(req.query.count as string) || 50));
  await log("SEED_STARTED", "USER", { count });

  // Atomic wipe respecting FK relationships
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.recoveryAction.deleteMany(),
    prisma.recoveryBatch.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  const customers = [];
  const txns = [];
  const exportRows: Record<string, unknown>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const isB2B = Math.random() < 0.2;
    const name = isB2B ? `${pick(COMPANIES)} Procurement` : pick(NAMES);
    const customerId = crypto.randomUUID();
    const email = `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "")}_${i}@example.com`;
    const phone = `+91${9000000000 + i}`;
    const customerType = isB2B ? CustomerType.B2B : CustomerType.B2C;
    const company = isB2B ? name : null;

    customers.push({ id: customerId, name, email, phone, type: customerType, company });

    const s = pick(SCENARIOS);
    const isInvoice = s.failureType === "INVOICE_OVERDUE";
    const amount = isB2B ? amt(5000, 500000) : isInvoice ? amt(1000, 50000) : amt(99, 9999);
    const txnId = crypto.randomUUID();
    const rzpId = `pay_mock_${now}_${i}`;
    const subId = s.failureType === "SUBSCRIPTION_FAILED" ? `sub_mock_${i}` : undefined;
    const invoiceDueDate = isInvoice ? new Date(now - Math.random() * 30 * 864e5) : undefined;
    const createdAt = new Date(now - Math.random() * 48 * 3600 * 1000); // spread across 48h for realistic time decay

    txns.push({
      id: txnId,
      customerId,
      razorpayPaymentId: rzpId,
      amount,
      failureType: s.failureType,
      errorCode: s.code,
      errorDescription: s.desc,
      status: TransactionStatus.FAILED,
      invoiceDueDate,
      createdAt,
      cartItems: s.failureType === "CHECKOUT_ABANDONED"
        ? [{ name: "Product A", price: amount * 0.6, qty: 1 }, { name: "Product B", price: amount * 0.4, qty: 2 }]
        : undefined,
      subscriptionId: subId,
    });

    exportRows.push({
      "Transaction ID": txnId,
      "Customer Name": name,
      "Customer Email": email,
      "Customer Phone": phone,
      "Customer Type": customerType,
      Company: company || "",
      "Amount (INR)": amount,
      Currency: "INR",
      "Failure Type": s.failureType,
      "Error Code": s.code,
      "Error Description": s.desc,
      Status: TransactionStatus.FAILED,
      "Razorpay Payment ID": rzpId,
      "Subscription ID": subId || "",
      "Invoice Due Date": invoiceDueDate ? invoiceDueDate.toISOString() : "",
      "Created At": createdAt.toISOString(),
    });
  }

  await prisma.$transaction([
    prisma.customer.createMany({ data: customers }),
    prisma.transaction.createMany({ data: txns }),
  ]);

  const csvFilePath = path.join(getExportsDir(), "generated_transactions.csv");
  fs.writeFileSync(csvFilePath, toCsv(exportRows), "utf-8");
  await log("SEED_COMPLETED", "USER", { created: txns.length, csvPath: csvFilePath });

  const breakdown: Record<string, number> = {};
  for (const t of txns) breakdown[t.failureType] = (breakdown[t.failureType] || 0) + 1;

  res.json({
    success: true,
    message: `Created ${txns.length} mock failed transactions and saved CSV`,
    downloadUrl: "/api/seed/download-csv",
    csvPath: "exports/generated_transactions.csv",
    created: txns.length,
    breakdown,
  });
}

/** GET /api/seed/download-csv — Stream/download the generated dataset as CSV */
export async function downloadGeneratedCSV(_req: Request, res: Response): Promise<void> {
  try {
    const csvFilePath = path.join(getExportsDir(), "generated_transactions.csv");
    let csvContent = "";

    if (fs.existsSync(csvFilePath)) {
      csvContent = fs.readFileSync(csvFilePath, "utf-8");
    } else {
      const txns = await prisma.transaction.findMany({
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      });
      csvContent = toCsv(
        txns.map((t) => ({
          "Transaction ID": t.id,
          "Customer Name": t.customer?.name || "",
          "Customer Email": t.customer?.email || "",
          "Customer Phone": t.customer?.phone || "",
          "Customer Type": t.customer?.type || "",
          Company: t.customer?.company || "",
          "Amount (INR)": t.amount,
          Currency: "INR",
          "Failure Type": t.failureType,
          "Error Code": t.errorCode || "",
          "Error Description": t.errorDescription || "",
          Status: t.status,
          "Razorpay Payment ID": t.razorpayPaymentId || "",
          "Subscription ID": t.subscriptionId || "",
          "Invoice Due Date": t.invoiceDueDate ? t.invoiceDueDate.toISOString() : "",
          "Created At": t.createdAt.toISOString(),
        })),
      );
      fs.writeFileSync(csvFilePath, csvContent, "utf-8");
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="generated_transactions_${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to download CSV", details: err?.message });
  }
}

