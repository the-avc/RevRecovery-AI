import axios from "axios";

const PYTHON_ENGINE_URL =
  process.env.PYTHON_ENGINE_URL || "http://localhost:8000";

export interface FailedTransactionContext {
  transactionId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerType: "B2C" | "B2B";
  amount: number;
  failureType: string;
  errorCode?: string;
  errorDescription?: string;
  retryCount: number;
  cartItems?: object[];
  invoiceDueDate?: string;
  subscriptionId?: string;
  minutesSinceFailure?: number; // drives Python time-decay (checkout < 30 min)
  promisedPayDate?: string; // tracks past promise-to-pay
}

export interface AIDecision {
  action: string;
  rootCause: string;
  reasoning: string;
  confidence: number;
  recoveryProbability: number;
  scheduledDelay?: number; // minutes to wait before executing
  discountPercent?: number; // if action includes a discount
  hinglishMessage?: string; // if voice call is recommended
  promisedPayDate?: string; // if customer mentioned a date in their message
}

/** Bridge to the Python AI engine. Falls back deterministically if Python is down. */
export async function getAIDecision(
  context: FailedTransactionContext,
): Promise<AIDecision> {
  try {
    const { data } = await axios.post<AIDecision>(
      `${PYTHON_ENGINE_URL}/analyze`,
      context,
      { timeout: 30000 },
    );
    return data.action ? data : fallback(context);
  } catch (error) {
    console.error(
      "[Python Bridge] AI decision failed, using fallback:",
      (error as Error).message,
    );
    return fallback(context);
  }
}

// Deterministic fallback mirrors models/recovery_probability.py rules — no network needed.
function fallback(c: FailedTransactionContext): AIDecision {
  const base = {
    rootCause: "Python engine unavailable — deterministic fallback",
    reasoning: "Fallback recovery attempt",
    confidence: 0.5,
    recoveryProbability: 0.4,
  };
  if (/SUSPECTED_FRAUD/i.test(c.errorCode || "") || c.retryCount >= 3)
    return { ...base, action: "NO_ACTION", confidence: 0.2, recoveryProbability: 0.05 };
  if (c.promisedPayDate && new Date(c.promisedPayDate) <= new Date())
    return { ...base, action: "PROMISE_TO_PAY_FOLLOWUP", reasoning: "Customer promised-to-pay date expired" };
  if (c.failureType === "INVOICE_OVERDUE" && c.customerType === "B2B")
    return {
      ...base,
      action: ["B2B_REMINDER_EMAIL", "B2B_FIRM_EMAIL", "B2B_ESCALATION_EMAIL"][Math.min(c.retryCount, 2)],
    };
  if (c.failureType === "SUBSCRIPTION_FAILED" || c.failureType === "MANDATE_FAILED")
    return { ...base, action: "MANDATE_RETRY", scheduledDelay: 60 };
  if (c.amount > 50000 && c.customerType === "B2C")
    return { ...base, action: "HINGLISH_VOICE_CALL", scheduledDelay: 5 };
  if (c.errorCode === "CARD_EXPIRED")
    return { ...base, action: "DELAYED_RETRY_LINK", scheduledDelay: 1440 };
  if (/INSUFFICIENT_FUNDS|BAD_REQUEST_ERROR/i.test(c.errorCode || "") && c.amount > 2000 && c.customerType === "B2C")
    return { ...base, action: "DISCOUNT_OFFER", discountPercent: 10, scheduledDelay: 120 };
  if (c.failureType === "CHECKOUT_ABANDONED")
    return { ...base, action: "IMMEDIATE_RETRY_LINK", discountPercent: c.amount > 1000 ? 5 : undefined };
  return { ...base, action: "IMMEDIATE_RETRY_LINK" };
}

/** Extracts a promise-to-pay date from a customer reply via Python NLP. */
export async function extractPromiseToPay(
  customerMessage: string,
): Promise<{ promisedDate: string | null; confidence: number }> {
  try {
    const { data } = await axios.post(
      `${PYTHON_ENGINE_URL}/extract-promise`,
      { message: customerMessage },
      { timeout: 15000 },
    );
    return {
      promisedDate: data.promisedDate ?? data.promised_date ?? null,
      confidence: data.confidence ?? 0,
    };
  } catch {
    return { promisedDate: null, confidence: 0 };
  }
}

/** Gets Hinglish TTS audio path from the Python engine. */
export async function generateHinglishVoice(
  customerName: string,
  amount: number,
): Promise<{ audioPath: string | null }> {
  try {
    const { data } = await axios.post(
      `${PYTHON_ENGINE_URL}/generate-voice`,
      { customerName, amount },
      { timeout: 30000 },
    );
    return { audioPath: data.audioPath ?? data.audio_path ?? null };
  } catch {
    return { audioPath: null };
  }
}
