from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from agents.root_cause_agent import extract_promise_to_pay

router = APIRouter()


class PromiseRequest(BaseModel):
    message: str


class PromiseResponse(BaseModel):
    promisedDate: Optional[str]
    confidence: float
    rawMention: Optional[str] = None


@router.post("/extract-promise", response_model=PromiseResponse)
async def extract_promise(req: PromiseRequest):
    """
    Extracts a Promise-to-Pay date from a customer's natural language message.
    Example: "I'll pay by end of month" → { promisedDate: "2024-01-31", confidence: 0.8 }
    """
    result = await extract_promise_to_pay(req.message)
    return PromiseResponse(
        promisedDate=result.get("promised_date"),
        confidence=result.get("confidence", 0.0),
        rawMention=result.get("raw_mention"),
    )
