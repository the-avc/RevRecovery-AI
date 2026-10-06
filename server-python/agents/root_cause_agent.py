"""
Root Cause Analyzer Agent
Uses Google Gemini to:
1. Diagnose the root cause of a failed transaction
2. Validate / refine the mathematical model's recommendation
3. Extract promise-to-pay dates from customer messages
"""

import os
import json
import re
from datetime import date
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

# Use the free Gemini Flash model — fast and generous free tier
model = genai.GenerativeModel("gemini-2.5-flash")

ALLOWED_ACTIONS = frozenset({
    "IMMEDIATE_RETRY_LINK",
    "DELAYED_RETRY_LINK",
    "DISCOUNT_OFFER",
    "B2B_REMINDER_EMAIL",
    "B2B_FIRM_EMAIL",
    "B2B_ESCALATION_EMAIL",
    "HINGLISH_VOICE_CALL",
    "MANDATE_RETRY",
    "PROMISE_TO_PAY_FOLLOWUP",
    "NO_ACTION",
})

VALID_SENTIMENTS = frozenset({"FRUSTRATED", "UNAWARE", "WILLING", "HOSTILE", "UNKNOWN"})
VALID_URGENCIES = frozenset({"IMMEDIATE", "SCHEDULED", "LOW"})

ANALYSIS_SYSTEM_PROMPT = """You are an expert AI revenue recovery agent for an Indian fintech company (UPI, cards, netbanking, mandates, B2B invoices).
Analyze a failed payment transaction and validate the mathematical model's recommendation.

You are a SECOND OPINION layer — the math model is the primary decision maker.
Defer to its `Recommended action` UNLESS you see a strong, specific reason to override
(e.g. fraud signal, B2B escalation order violated, high-value personal outreach clearly better).
When you override, explain why in `reasoning`.

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "root_cause": "Brief diagnosis (1-2 sentences, use error_description if present)",
  "reasoning": "Why you validate or override the math action (2-3 sentences, reference probability + retry_count + customer_type)",
  "validated_action": "One of the allowed action types below",
  "confidence": 0.0-1.0,
  "customer_sentiment": "FRUSTRATED | UNAWARE | WILLING | HOSTILE | UNKNOWN",
  "urgency": "IMMEDIATE | SCHEDULED | LOW",
  "hinglish_message": "Short Hinglish message (only if HINGLISH_VOICE_CALL, else null)"
}

Allowed actions: IMMEDIATE_RETRY_LINK, DELAYED_RETRY_LINK, DISCOUNT_OFFER,
B2B_REMINDER_EMAIL, B2B_FIRM_EMAIL, B2B_ESCALATION_EMAIL,
HINGLISH_VOICE_CALL, MANDATE_RETRY, PROMISE_TO_PAY_FOLLOWUP, NO_ACTION

Decision rules (in precedence order — rule 1 beats all below):
1. SUSPECTED_FRAUD (error_code) OR recovery probability < 0.10 → ALWAYS NO_ACTION. Never contact.
2. retry_count >= 3 → NO_ACTION (or LOW urgency). Do not spam the customer.
3. B2B + failure_type INVOICE_OVERDUE → MUST use the email chain in order:
   retry_count 0 = B2B_REMINDER_EMAIL, 1 = B2B_FIRM_EMAIL, >=2 = B2B_ESCALATION_EMAIL.
   Never offer DISCOUNT_OFFER on B2B invoices. Never use HINGLISH_VOICE_CALL for B2B unless amount > 50000 AND probability > 0.6 AND retry_count >= 2.
4. failure_type SUBSCRIPTION_FAILED / MANDATE_FAILED (or error SUBSCRIPTION_CHARGE_FAILED / MANDATE_DEBIT_FAILED) → MANDATE_RETRY (retry auto-debit at optimal time, ~60 min delay).
5. High-value B2C: amount > 50000 INR AND probability > 0.6 AND retry_count < 3 → HINGLISH_VOICE_CALL.
6. GATEWAY_ERROR / SERVER_ERROR with probability > 0.7 → IMMEDIATE_RETRY_LINK (temporary issue, intent was clear).
7. INSUFFICIENT_FUNDS / BAD_REQUEST_ERROR (bank declined): amount > 2000 → DISCOUNT_OFFER (10%, after ~2h delay); else DELAYED_RETRY_LINK (~60 min).
8. CARD_EXPIRED → DELAYED_RETRY_LINK (customer must update card — never IMMEDIATE).
9. CHECKOUT_ABANDONED → IMMEDIATE_RETRY_LINK within 30 min (5% discount if amount > 1000).
10. PROMISE_TO_PAY_FOLLOWUP is ONLY for customers who already gave a promise-to-pay date. Do not invent it for fresh failures.

Sentiment guide:
- FRUSTRATED = repeated retries / gateway errors / complaint language
- UNAWARE = single checkout abandon / first invoice reminder
- WILLING = subscription / mandate failure (wants service), partial payment intent
- HOSTILE = abuse / fraud / do-not-contact signals
- UNKNOWN = not enough signal (default)

Urgency guide:
- IMMEDIATE = gateway/server error + high probability, checkout abandoned < 30 min, high-value voice call
- SCHEDULED = B2B emails, mandate retry, delayed retry, discount offer (default)
- LOW = probability < 0.3, retry_count >= 2, NO_ACTION

hinglish_message rules:
- ONLY when validated_action is HINGLISH_VOICE_CALL, else null.
- Roman-script Hinglish (e.g. "Namaste Rohan ji, aapka ₹12,000 ka payment fail ho gaya..."), <= 160 chars, polite, 1 greeting + amount + 1 CTA (retry link / callback).
- Never include card numbers, OTPs, or full payment links.

Confidence calibration:
- Mirror recovery probability closely (±0.15) unless strong contradictory signal.
- Low confidence (<0.4) when error_description is missing/ambiguous or retry_count >= 2.
- Never return 1.0 — max 0.95.
"""

# Fallback response when Gemini is unavailable — mirrors math model exactly
# so the pipeline degrades gracefully to deterministic rules.
def _fallback(math_model_action: str, recovery_probability: float, error_code: str = "UNKNOWN") -> dict:
    action = math_model_action if math_model_action in ALLOWED_ACTIONS else "NO_ACTION"
    # Fraud / hopeless cases must never get a voice call, even in fallback.
    if error_code == "SUSPECTED_FRAUD" or recovery_probability < 0.10:
        action = "NO_ACTION"
    return {
        "root_cause": f"Error code {error_code} indicates payment failure",
        "reasoning": "Using mathematical model recommendation (Gemini unavailable)",
        "validated_action": action,
        "confidence": max(0.0, min(0.95, float(recovery_probability))),
        "customer_sentiment": "UNKNOWN",
        "urgency": "LOW" if action == "NO_ACTION" else "SCHEDULED",
        "hinglish_message": None,
    }


def _sanitize_analysis(
    parsed: dict,
    math_model_action: str,
    recovery_probability: float,
    transaction_context: dict,
) -> dict:
    """Enforces the contract the route + Node engine depend on.

    The LLM is untrusted input: clamp enums, clamp confidence, force the
    allowed action list, and re-apply hard safety rules (fraud, retry cap).
    """
    safe_action = parsed.get("validated_action", math_model_action)
    if safe_action not in ALLOWED_ACTIONS:
        safe_action = math_model_action if math_model_action in ALLOWED_ACTIONS else "NO_ACTION"

    # Hard safety overrides — must match models/recovery_probability.py
    error_code = transaction_context.get("error_code") or "UNKNOWN"
    retry_count = transaction_context.get("retry_count", 0) or 0
    try:
        retry_count = int(retry_count)
    except (TypeError, ValueError):
        retry_count = 0
    if error_code == "SUSPECTED_FRAUD" or recovery_probability < 0.10 or retry_count >= 3:
        safe_action = "NO_ACTION"

    try:
        confidence = float(parsed.get("confidence", recovery_probability))
    except (TypeError, ValueError):
        confidence = float(recovery_probability)
    confidence = max(0.0, min(0.95, confidence))

    sentiment = parsed.get("customer_sentiment", "UNKNOWN")
    if sentiment not in VALID_SENTIMENTS:
        sentiment = "UNKNOWN"

    urgency = parsed.get("urgency", "SCHEDULED")
    if urgency not in VALID_URGENCIES:
        urgency = "LOW" if safe_action == "NO_ACTION" else "SCHEDULED"

    hinglish = parsed.get("hinglish_message")
    if safe_action != "HINGLISH_VOICE_CALL":
        hinglish = None
    elif isinstance(hinglish, str):
        hinglish = hinglish.strip()[:160] or None

    return {
        "root_cause": str(parsed.get("root_cause") or f"Error code {error_code} indicates payment failure")[:500],
        "reasoning": str(parsed.get("reasoning") or "Validated against mathematical model")[:1000],
        "validated_action": safe_action,
        "confidence": round(confidence, 3),
        "customer_sentiment": sentiment,
        "urgency": urgency,
        "hinglish_message": hinglish,
    }


def _parse_json_from_llm(text: str) -> dict:
    """Strips markdown code fences from LLM output and parses JSON."""
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise


async def analyze_transaction(
    transaction_context: dict,
    math_model_action: str,
    recovery_probability: float,
) -> dict:
    """
    Uses Gemini to validate and enrich the math model's decision.
    The LLM is a second opinion layer, not the primary decision maker.
    Output is always sanitized so downstream code sees a valid contract.
    """
    error_code = (transaction_context or {}).get("error_code") or "UNKNOWN"
    if not os.getenv("GEMINI_API_KEY"):
        return _fallback(math_model_action, recovery_probability, error_code)

    prompt = f"""{ANALYSIS_SYSTEM_PROMPT}

Transaction:
{json.dumps(transaction_context, indent=2, default=str)}

Math model result:
- Recovery probability: {recovery_probability:.2f}
- Recommended action: {math_model_action}

Validate or override the recommended action per the decision rules above.
Analyze and respond ONLY with the JSON object."""

    try:
        response = await model.generate_content_async(prompt)
        parsed = _parse_json_from_llm(response.text)
        if not isinstance(parsed, dict):
            raise ValueError("LLM did not return a JSON object")
        return _sanitize_analysis(parsed, math_model_action, recovery_probability, transaction_context)
    except Exception as e:
        print(f"[Gemini] Analysis failed: {e}")
        return _fallback(math_model_action, recovery_probability, error_code)


async def extract_promise_to_pay(customer_message: str) -> dict:
    """
    Extracts a promise-to-pay date from a customer's natural language reply.
    Example: "I'll pay on Friday" → { "promised_date": "2024-01-26", "confidence": 0.9 }
    Returns past dates as-is with low confidence so the caller can decide;
    never invents a date when none is mentioned.
    """
    if not os.getenv("GEMINI_API_KEY"):
        return {"promised_date": None, "confidence": 0.0, "raw_mention": None}

    prompt = f"""Extract a promise-to-pay date from this customer message. Today is {date.today()} (YYYY-MM-DD).

Customer message: "{customer_message}"

Rules:
- Resolve relative phrases ("tomorrow", "next Friday", "end of month", "5 tarikh") against today.
- If no explicit or clearly implied date exists, return promised_date null with confidence 0.0.
- Past dates: return the date but with confidence <= 0.3.
- Vague ("soon", "later", "jaldi") without a date → null, confidence <= 0.3.

Respond ONLY with JSON:
{{
  "promised_date": "YYYY-MM-DD or null if no date found",
  "confidence": 0.0-1.0,
  "raw_mention": "the exact phrase mentioning the date or null"
}}"""

    try:
        response = await model.generate_content_async(prompt)
        parsed = _parse_json_from_llm(response.text)
        if not isinstance(parsed, dict):
            raise ValueError("LLM did not return a JSON object")
        promised = parsed.get("promised_date")
        if promised is not None:
            promised = str(promised).strip() or None
            # Validate ISO format; reject garbage like "soon" or "Friday".
            if promised is not None:
                try:
                    date.fromisoformat(promised)
                except ValueError:
                    promised = None
        try:
            confidence = float(parsed.get("confidence", 0.0 if promised is None else 0.7))
        except (TypeError, ValueError):
            confidence = 0.0 if promised is None else 0.7
        if promised is None:
            confidence = min(confidence, 0.3)
        raw = parsed.get("raw_mention")
        raw = str(raw).strip()[:200] if isinstance(raw, str) and raw.strip() else None
        return {
            "promised_date": promised,
            "confidence": max(0.0, min(0.95, confidence)),
            "raw_mention": raw,
        }
    except Exception:
        return {"promised_date": None, "confidence": 0.0, "raw_mention": None}
