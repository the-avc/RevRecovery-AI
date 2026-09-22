"""
Root Cause Analyzer Agent
Uses Google Gemini to:
1. Diagnose the root cause of a failed transaction
2. Validate / refine the mathematical model's recommendation
3. Extract promise-to-pay dates from customer messages
"""

import os
import json
from datetime import date
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

# Use the free Gemini Flash model — fast and generous free tier
model = genai.GenerativeModel("gemini-2.5-flash")

ANALYSIS_SYSTEM_PROMPT = """You are an expert AI revenue recovery agent for a fintech company.
Analyze failed payment transactions and determine the best recovery strategy.

Respond ONLY with a valid JSON object:
{
  "root_cause": "Brief diagnosis (1-2 sentences)",
  "reasoning": "Why you recommend this action (2-3 sentences)",
  "validated_action": "One of the allowed action types below",
  "confidence": 0.0-1.0,
  "customer_sentiment": "FRUSTRATED | UNAWARE | WILLING | HOSTILE | UNKNOWN",
  "urgency": "IMMEDIATE | SCHEDULED | LOW",
  "hinglish_message": "Short Hinglish message (only if HINGLISH_VOICE_CALL, else null)"
}

Allowed actions: IMMEDIATE_RETRY_LINK, DELAYED_RETRY_LINK, DISCOUNT_OFFER,
B2B_REMINDER_EMAIL, B2B_FIRM_EMAIL, B2B_ESCALATION_EMAIL,
HINGLISH_VOICE_CALL, MANDATE_RETRY, PROMISE_TO_PAY_FOLLOWUP, NO_ACTION

Rules:
- NEVER use an action outside the allowed list
- SUSPECTED_FRAUD → always NO_ACTION
- GATEWAY_ERROR → prefer IMMEDIATE_RETRY_LINK
- B2B invoices → use the B2B email chain
- High-value (>50000 INR) with good probability → consider HINGLISH_VOICE_CALL
"""

# Fallback response when Gemini is unavailable
def _fallback(math_model_action: str, recovery_probability: float, error_code: str = "UNKNOWN") -> dict:
    return {
        "root_cause": f"Error code {error_code} indicates payment failure",
        "reasoning": "Using mathematical model recommendation (Gemini unavailable)",
        "validated_action": math_model_action,
        "confidence": recovery_probability,
        "customer_sentiment": "UNKNOWN",
        "urgency": "SCHEDULED",
        "hinglish_message": None,
    }


def _parse_json_from_llm(text: str) -> dict:
    """Strips markdown code fences from LLM output and parses JSON."""
    text = text.strip()
    if "```" in text:
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


async def analyze_transaction(
    transaction_context: dict,
    math_model_action: str,
    recovery_probability: float,
) -> dict:
    """
    Uses Gemini to validate and enrich the math model's decision.
    The LLM is a second opinion layer, not the primary decision maker.
    """
    if not os.getenv("GEMINI_API_KEY"):
        return _fallback(math_model_action, recovery_probability, transaction_context.get("error_code", "UNKNOWN"))

    prompt = f"""{ANALYSIS_SYSTEM_PROMPT}

Transaction:
{json.dumps(transaction_context, indent=2)}

Math model result:
- Recovery probability: {recovery_probability:.2f}
- Recommended action: {math_model_action}

Analyze and respond ONLY with the JSON object."""

    try:
        response = await model.generate_content_async(prompt)
        return _parse_json_from_llm(response.text)
    except Exception as e:
        print(f"[Gemini] Analysis failed: {e}")
        return _fallback(math_model_action, recovery_probability)


async def extract_promise_to_pay(customer_message: str) -> dict:
    """
    Extracts a promise-to-pay date from a customer's natural language reply.
    Example: "I'll pay on Friday" → { "promised_date": "2024-01-26", "confidence": 0.9 }
    """
    if not os.getenv("GEMINI_API_KEY"):
        return {"promised_date": None, "confidence": 0.0}

    prompt = f"""Extract a promise-to-pay date from this customer message. Today is {date.today()}.

Customer message: "{customer_message}"

Respond ONLY with JSON:
{{
  "promised_date": "YYYY-MM-DD or null if no date found",
  "confidence": 0.0-1.0,
  "raw_mention": "the exact phrase mentioning the date or null"
}}"""

    try:
        response = await model.generate_content_async(prompt)
        return _parse_json_from_llm(response.text)
    except Exception:
        return {"promised_date": None, "confidence": 0.0, "raw_mention": None}
