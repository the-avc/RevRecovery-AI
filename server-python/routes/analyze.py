"""
Analysis Route
The main endpoint called by Node.js for AI decisions on failed transactions.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

from models.recovery_probability import compute_recovery_probability, recommend_action
from agents.root_cause_agent import analyze_transaction

router = APIRouter()


class TransactionContext(BaseModel):
    transactionId: str
    customerId: str
    customerName: str
    customerEmail: str
    customerPhone: Optional[str] = None
    customerType: str = "B2C"
    amount: float
    failureType: str
    errorCode: Optional[str] = None
    errorDescription: Optional[str] = None
    retryCount: int = 0
    cartItems: Optional[List[dict]] = None
    invoiceDueDate: Optional[str] = None
    subscriptionId: Optional[str] = None
    minutesSinceFailure: Optional[float] = 60.0


class AIDecisionResponse(BaseModel):
    action: str
    rootCause: str
    reasoning: str
    confidence: float
    recoveryProbability: float
    scheduledDelay: Optional[int] = None      # minutes
    discountPercent: Optional[float] = None
    hinglishMessage: Optional[str] = None
    promisedPayDate: Optional[str] = None
    customerSentiment: Optional[str] = None


@router.post("/analyze", response_model=AIDecisionResponse)
async def analyze(ctx: TransactionContext):
    """
    Main analysis endpoint. Two-stage decision:
    1. Math model computes recovery probability and base action
    2. Gemini LLM validates and enriches the decision
    """
    # Stage 1: Math model
    recovery_prob = compute_recovery_probability(
        error_code=ctx.errorCode or "DEFAULT",
        amount=ctx.amount,
        retry_count=ctx.retryCount,
        customer_type=ctx.customerType,
        failure_type=ctx.failureType,
        minutes_since_failure=ctx.minutesSinceFailure or 60.0,
    )

    math_decision = recommend_action(
        probability=recovery_prob,
        error_code=ctx.errorCode or "DEFAULT",
        amount=ctx.amount,
        customer_type=ctx.customerType,
        failure_type=ctx.failureType,
        retry_count=ctx.retryCount,
    )

    # Stage 2: LLM enrichment — pass only the fields the LLM actually needs
    llm_analysis = await analyze_transaction(
        transaction_context={
            "transaction_id": ctx.transactionId,
            "customer_type": ctx.customerType,
            "amount_inr": ctx.amount,
            "failure_type": ctx.failureType,
            "error_code": ctx.errorCode,
            "error_description": ctx.errorDescription,
            "retry_count": ctx.retryCount,
            "has_cart_items": ctx.cartItems is not None,
            "is_subscription": ctx.subscriptionId is not None,
            "invoice_overdue": ctx.invoiceDueDate is not None,
        },
        math_model_action=math_decision["action"],
        recovery_probability=recovery_prob,
    )

    return AIDecisionResponse(
        action=llm_analysis.get("validated_action", math_decision["action"]),
        rootCause=llm_analysis.get("root_cause", "Payment processing failure"),
        reasoning=llm_analysis.get("reasoning", math_decision.get("reason", "")),
        confidence=llm_analysis.get("confidence", recovery_prob),
        recoveryProbability=recovery_prob,
        scheduledDelay=math_decision.get("scheduled_delay_minutes"),
        discountPercent=math_decision.get("discount_percent"),
        hinglishMessage=llm_analysis.get("hinglish_message"),
        customerSentiment=llm_analysis.get("customer_sentiment"),
    )
