"""Recovery Probability Model — transparent scoring (not black-box ML).
P(recovery) = error_weight x amount x retry_decay x time x customer_type."""


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

def _norm(v, default="DEFAULT"):  # Razorpay sends lowercase; frontend sends enums
    return (v or default).strip().upper() or default

def _num(v, default=0.0):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return default

_B2B_CHAIN = ("B2B_REMINDER_EMAIL", "B2B_FIRM_EMAIL", "B2B_ESCALATION_EMAIL")
_B2B_WHY = ("polite first reminder", "firm second follow-up", "escalating to senior contact")


def compute_recovery_probability(
    error_code: str,
    amount: float,
    retry_count: int,
    customer_type: str,  # "B2C" or "B2B"
    failure_type: str,
    minutes_since_failure: float = 60.0,
) -> float:
    """P(recovery) in [0.0, 1.0]."""
    error, fail, cust = _norm(error_code), _norm(failure_type), _norm(customer_type, "B2C")
    amount, retries = max(0.0, _num(amount)), max(0, int(_num(retry_count)))
    mins = max(0.0, _num(minutes_since_failure, 60.0))
    base = ERROR_RECOVERY_WEIGHTS.get(error, ERROR_RECOVERY_WEIGHTS["DEFAULT"])

    # Sweet spot: Rs.500-50k. Tiny amounts not worth chasing; huge ones need care.
    amt = 0.7 if amount < 100 else 0.85 if amount < 500 else 1.0 if amount <= 50_000 else 0.95 if amount <= 2_00_000 else 0.90
    decay = max(0.3, 1.0 - retries * 0.25)  # each retry: user may be ignoring us
    # Abandonment decays in hours; other failures decay slowly over days.
    time = (1.0 if mins < 30 else 0.75 if mins < 120 else 0.45) if fail == "CHECKOUT_ABANDONED" \
        else max(0.5, 1.0 - (mins / 1440) * 0.05)
    return round(min(1.0, max(0.0, base * amt * decay * time * (1.1 if cust == "B2B" else 1.0))), 3)


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

    Precedence (first match wins): fraud/low-p → retry cap → B2B chain →
    mandate → high-value voice → gateway → funds/decline → card expired →
    checkout abandon → default retry.
    """
    error_code = _norm(error_code)
    failure_type = _norm(failure_type)
    customer_type = _norm(customer_type, "B2C")
    try:
        retry_count = max(0, int(_num(retry_count)))
    except (TypeError, ValueError):
        retry_count = 0
    probability = min(1.0, max(0.0, _num(probability)))
    R = lambda a, r, d=None, s=None: {"action": a, "reason": r, "discount_percent": d, "scheduled_delay_minutes": s}

    # 1. Fraud / hopeless — never contact.
    if error_code == "SUSPECTED_FRAUD" or probability < 0.1:
        return R("NO_ACTION", "Suspected fraud or churned user")

    # 2. Retry cap — matches Node recovery-engine (retryCount >= 3 → ABANDONED).
    if retry_count >= 3:
        return R("NO_ACTION", "Max retries reached — suppressing outreach")

    amount = max(0.0, _num(amount))
    # 3. B2B chain — before voice so B2B never gets discounts/calls.
    if failure_type == "INVOICE_OVERDUE" and customer_type == "B2B":
        i = min(retry_count, 2)
        return R(_B2B_CHAIN[i], f"B2B invoice — {_B2B_WHY[i]}", s=0)

    # 4. Subscription/mandate failure (failure_type or matching error codes).
    if failure_type in ("SUBSCRIPTION_FAILED", "MANDATE_FAILED") or error_code in (
        "SUBSCRIPTION_CHARGE_FAILED",
        "MANDATE_DEBIT_FAILED",
    ):
        return R("MANDATE_RETRY", "Retrying auto-debit at optimal time", s=60)

    # 5. High-value B2C → voice. B2B stays on email chain.
    if amount > 50_000 and probability > 0.6 and customer_type == "B2C":
        return R("HINGLISH_VOICE_CALL", "High-value — personal Hinglish voice outreach", s=5)

    # 6. Gateway/server errors (low-p falls through to delayed retry, not default).
    if error_code in ("GATEWAY_ERROR", "SERVER_ERROR"):
        return R("IMMEDIATE_RETRY_LINK", "Temporary failure — intent was clear", s=0) if probability > 0.7 \
            else R("DELAYED_RETRY_LINK", "Technical failure, low confidence — delayed retry", s=60)

    # 7. Funds/decline — B2C only (B2B handled by chain above, never discounted).
    if error_code in ("INSUFFICIENT_FUNDS", "BAD_REQUEST_ERROR") and customer_type == "B2C":
        return R("DISCOUNT_OFFER", "High cart value with friction — discount to close", 10, 120) if amount > 2000 \
            else R("DELAYED_RETRY_LINK", "Standard retry after short delay", s=60)

    # 8. Expired card — manual action needed, never immediate.
    if error_code == "CARD_EXPIRED":
        return R("DELAYED_RETRY_LINK", "Card expired — needs payment-method update", s=1440)

    # 9. Abandonment — quick follow-up.
    if failure_type == "CHECKOUT_ABANDONED":
        return R("IMMEDIATE_RETRY_LINK", "Abandoned cart — quick follow-up", 5 if amount > 1000 else None, s=0)
    return R("IMMEDIATE_RETRY_LINK", "General recovery attempt with payment link", s=0)
