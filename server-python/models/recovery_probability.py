"""
Recovery Probability Model
==========================
This module implements the mathematical/statistical model for predicting
the probability that a given failed transaction can be recovered.

We use a scoring function based on domain-specific features:
- Error type severity (network errors are more recoverable than fraud)
- Amount (medium amounts are most recoverable)
- Retry count (diminishing returns)
- Customer type (B2B has longer patience cycles)
- Time sensitivity (checkout abandonment recovers best within 1 hour)

This is intentionally a transparent, interpretable scoring model rather than
a black-box ML model — which is more appropriate for financial decisions
and is easier to audit (which the hackathon requires).
"""


# Error code recovery weights — based on domain knowledge
# Higher = more likely to recover
ERROR_RECOVERY_WEIGHTS: dict[str, float] = {
    "GATEWAY_ERROR": 0.85,          # Bank was down temporarily — very recoverable
    "SERVER_ERROR": 0.80,           # Technical issue — recoverable
    "CHECKOUT_ABANDONED": 0.65,     # User had intent — moderately recoverable
    "BAD_REQUEST_ERROR": 0.55,      # Bank declined — needs different approach
    "SUBSCRIPTION_CHARGE_FAILED": 0.70,  # User wants the service
    "INVOICE_EXPIRED": 0.60,        # B2B — will pay with right follow-up
    "MANDATE_DEBIT_FAILED": 0.65,   # Timing issue — retry at month start
    "INSUFFICIENT_FUNDS": 0.40,     # Low funds — needs incentive or time
    "CARD_EXPIRED": 0.50,           # Card issue — needs manual action
    "SUSPECTED_FRAUD": 0.05,        # Almost never recoverable
    "DEFAULT": 0.45,
}

def compute_recovery_probability(
    error_code: str,
    amount: float,
    retry_count: int,
    customer_type: str,  # "B2C" or "B2B"
    failure_type: str,
    minutes_since_failure: float = 60.0,
) -> float:
    """
    Computes P(recovery) for a failed transaction using a weighted scoring model.
    
    Returns a float in [0.0, 1.0].
    """

    # Base probability from error code
    base_prob = ERROR_RECOVERY_WEIGHTS.get(error_code, ERROR_RECOVERY_WEIGHTS["DEFAULT"])

    # === Feature 1: Amount factor ===
    # Very small amounts (<₹100) may not be worth aggressive recovery
    # Very large amounts (>₹1L) have higher stakes but also higher recovery effort
    # Sweet spot: ₹500 - ₹50,000
    if amount < 100:
        amount_factor = 0.7
    elif amount < 500:
        amount_factor = 0.85
    elif amount <= 50_000:
        amount_factor = 1.0
    elif amount <= 2_00_000:
        amount_factor = 0.95  # B2B large — still very worth it
    else:
        amount_factor = 0.90

    # === Feature 2: Retry count decay ===
    # Each retry reduces probability (user may be ignoring us)
    retry_decay = max(0.3, 1.0 - (retry_count * 0.25))

    # === Feature 3: Time sensitivity ===
    # Checkout abandonment: recover in < 30 min = great; > 2 hours = poor
    # Payment failures: less time-sensitive
    if failure_type == "CHECKOUT_ABANDONED":
        if minutes_since_failure < 30:
            time_factor = 1.0
        elif minutes_since_failure < 120:
            time_factor = 0.75
        else:
            time_factor = 0.45
    else:
        # Other types: slight decay over first 7 days
        days_since = minutes_since_failure / (60 * 24)
        time_factor = max(0.5, 1.0 - (days_since * 0.05))

    # === Feature 4: Customer type adjustment ===
    # B2B customers have contractual obligations — often do pay eventually
    customer_factor = 1.1 if customer_type == "B2B" else 1.0

    # === Combine all factors ===
    probability = base_prob * amount_factor * retry_decay * time_factor * customer_factor

    # Clamp to [0, 1]
    return round(min(1.0, max(0.0, probability)), 3)


def recommend_action(
    probability: float,
    error_code: str,
    amount: float,
    customer_type: str,
    failure_type: str,
    retry_count: int,
) -> dict:
    """
    Maps the probability score to a recommended action type.
    This is the "bounded" decision logic — the AI cannot go outside these options.
    """

    if probability < 0.1:
        return {
            "action": "NO_ACTION",
            "reason": "Very low recovery probability — suspected fraud or user has churned",
            "discount_percent": None,
            "scheduled_delay_minutes": None,
        }

    # High-value transactions (>₹50k) with good probability → voice call
    if amount > 50_000 and probability > 0.6:
        return {
            "action": "HINGLISH_VOICE_CALL",
            "reason": "High-value transaction — personal Hinglish voice outreach for maximum impact",
            "discount_percent": None,
            "scheduled_delay_minutes": 5,
        }

    # B2B invoice handling → escalation chain
    if failure_type == "INVOICE_OVERDUE" and customer_type == "B2B":
        if retry_count == 0:
            return {
                "action": "B2B_REMINDER_EMAIL",
                "reason": "First B2B invoice reminder — polite approach",
                "discount_percent": None,
                "scheduled_delay_minutes": 0,
            }
        elif retry_count == 1:
            return {
                "action": "B2B_FIRM_EMAIL",
                "reason": "Second follow-up — firm reminder",
                "discount_percent": None,
                "scheduled_delay_minutes": 0,
            }
        else:
            return {
                "action": "B2B_ESCALATION_EMAIL",
                "reason": "Third attempt — escalating to senior contact",
                "discount_percent": None,
                "scheduled_delay_minutes": 0,
            }

    # Network/gateway errors → immediate retry link (user had intent)
    if error_code in ("GATEWAY_ERROR", "SERVER_ERROR") and probability > 0.7:
        return {
            "action": "IMMEDIATE_RETRY_LINK",
            "reason": "Temporary technical failure — user had clear payment intent",
            "discount_percent": None,
            "scheduled_delay_minutes": 0,
        }

    # Subscription failure → mandate retry
    if failure_type in ("SUBSCRIPTION_FAILED", "MANDATE_FAILED"):
        return {
            "action": "MANDATE_RETRY",
            "reason": "Retrying auto-debit at optimal time",
            "discount_percent": None,
            "scheduled_delay_minutes": 60,  # retry in 1 hour
        }

    # Insufficient funds / card issues — offer discount to high-value carts
    if error_code in ("INSUFFICIENT_FUNDS", "BAD_REQUEST_ERROR"):
        if amount > 2000:
            return {
                "action": "DISCOUNT_OFFER",
                "reason": "High cart value with payment friction — discount offer to close the deal",
                "discount_percent": 10,
                "scheduled_delay_minutes": 120,  # Wait 2 hours, then offer
            }
        else:
            return {
                "action": "DELAYED_RETRY_LINK",
                "reason": "Standard retry after short delay",
                "discount_percent": None,
                "scheduled_delay_minutes": 60,
            }

    # Checkout abandonment — quick follow-up
    if failure_type == "CHECKOUT_ABANDONED":
        return {
            "action": "IMMEDIATE_RETRY_LINK",
            "reason": "Cart abandonment — user showed purchase intent, quick follow-up",
            "discount_percent": 5 if amount > 1000 else None,
            "scheduled_delay_minutes": 15,
        }

    # Default: send a retry link
    return {
        "action": "IMMEDIATE_RETRY_LINK",
        "reason": "General recovery attempt with payment link",
        "discount_percent": None,
        "scheduled_delay_minutes": 30,
    }
