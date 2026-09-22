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

/**
 * The main bridge to the Python AI Engine.
 * Sends transaction context and gets back an AI decision.
 */
export async function getAIDecision(
  context: FailedTransactionContext,
): Promise<AIDecision> {
  try {
    const response = await axios.post<AIDecision>(
      `${PYTHON_ENGINE_URL}/analyze`,
      context,
      { timeout: 30000 },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Python Bridge] Failed to get AI decision, using fallback:",
      error,
    );
    // Fallback decision if Python engine is down
    return {
      action: "IMMEDIATE_RETRY_LINK",
      rootCause: "Unknown - Python engine unavailable",
      reasoning: "Fallback: Sending a basic retry link",
      confidence: 0.5,
      recoveryProbability: 0.4,
    };
  }
}

/**
 * Sends a customer reply message to the Python engine to extract
 * a Promise-to-Pay date using NLP
 */
export async function extractPromiseToPay(
  customerMessage: string,
): Promise<{ promisedDate: string | null; confidence: number }> {
  try {
    const response = await axios.post(
      `${PYTHON_ENGINE_URL}/extract-promise`,
      { message: customerMessage },
      { timeout: 15000 },
    );
    return response.data;
  } catch {
    return { promisedDate: null, confidence: 0 };
  }
}

/**
 * Gets the Hinglish voice audio file path from the Python TTS engine
 */
export async function generateHinglishVoice(
  customerName: string,
  amount: number,
  paymentLink: string,
): Promise<{ audioPath: string | null }> {
  try {
    const response = await axios.post(
      `${PYTHON_ENGINE_URL}/generate-voice`,
      { customerName, amount, paymentLink },
      { timeout: 30000 },
    );
    return response.data;
  } catch {
    return { audioPath: null };
  }
}
