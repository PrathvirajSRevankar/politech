"""
routers/nova.py — NOVA Q&A Knowledge Base chat endpoint.
Replaces Gemini AI with a database-backed fixed Q&A system.
"""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from auth import require_role, TokenData
from db import get_db
from models.nova_qa import NovaQA

router = APIRouter(prefix="/api/v1/nova", tags=["NOVA"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class NovaChatRequest(BaseModel):
    message: str

class NovaChatResponse(BaseModel):
    reply: str
    matched_question: Optional[str] = None
    confidence: float = 0.0

class QACreate(BaseModel):
    category: str = "general"
    question: str
    answer: str
    keywords: Optional[str] = None

class QAOut(BaseModel):
    id: int
    category: str
    question: str
    answer: str
    keywords: Optional[str]

    class Config:
        from_attributes = True


# ── Matching Engine ───────────────────────────────────────────────────────────

def _tokenize(text: str) -> set:
    """Lowercase, strip punctuation, split into words."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return set(text.split())

def _score(message_tokens: set, qa: NovaQA) -> float:
    """
    Score a Q&A entry against a tokenized message.
    Combines keyword overlap + question-word overlap.
    """
    score = 0.0

    # 1. Keyword hints (weighted 2x)
    if qa.keywords:
        kw_tokens = _tokenize(qa.keywords)
        matches = message_tokens & kw_tokens
        if kw_tokens:
            score += 2.0 * len(matches) / len(kw_tokens)

    # 2. Question word overlap
    q_tokens = _tokenize(qa.question)
    # Remove common stop words
    stops = {"what","is","are","how","do","i","the","a","an","in","to","of",
             "can","does","my","it","this","that","and","or","for","me","you"}
    q_tokens -= stops
    message_tokens_clean = message_tokens - stops

    if q_tokens:
        overlap = message_tokens_clean & q_tokens
        score += len(overlap) / len(q_tokens)

    return score

def find_best_match(message: str, db: Session):
    """Return (best_qa, confidence) or (None, 0) if nothing matches."""
    all_qa = db.query(NovaQA).all()
    if not all_qa:
        return None, 0.0

    msg_tokens = _tokenize(message)
    best_qa, best_score = None, 0.0

    for qa in all_qa:
        s = _score(msg_tokens, qa)
        if s > best_score:
            best_score = s
            best_qa = qa

    return best_qa, round(best_score, 3)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
def nova_status(_: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst"))):
    """NOVA system status."""
    return {"mode": "qa_database", "gemini_active": False, "model": "local-kb"}


@router.post("/chat", response_model=NovaChatResponse)
def nova_chat(
    body: NovaChatRequest,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    """
    Match the incoming message against the Q&A knowledge base.
    Returns the best matching answer or a fallback message.
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    qa, confidence = find_best_match(body.message, db)

    # Threshold — must have at least some meaningful match
    MIN_CONFIDENCE = 0.3

    if qa and confidence >= MIN_CONFIDENCE:
        return NovaChatResponse(
            reply=qa.answer,
            matched_question=qa.question,
            confidence=confidence,
        )

    return NovaChatResponse(
        reply="I don't have an answer for that yet. Type <strong>\"help\"</strong> to see what I can do, or ask about officers, incidents, duties, or system usage.",
        matched_question=None,
        confidence=0.0,
    )


@router.get("/qa", response_model=List[QAOut])
def list_qa(
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin", "analyst")),
):
    """List all Q&A entries in the knowledge base."""
    return db.query(NovaQA).all()


@router.post("/qa", response_model=QAOut)
def add_qa(
    body: QACreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    """Add a new Q&A entry (admin only)."""
    entry = NovaQA(
        category=body.category,
        question=body.question,
        answer=body.answer,
        keywords=body.keywords,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/qa/{qa_id}")
def delete_qa(
    qa_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    """Delete a Q&A entry (admin only)."""
    entry = db.query(NovaQA).filter(NovaQA.id == qa_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Q&A entry not found.")
    db.delete(entry)
    db.commit()
    return {"detail": "Deleted successfully."}
