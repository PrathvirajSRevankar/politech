"""
routers/nova.py — NOVA AI Command Assistant backend proxy for Gemini API.
Proxies chat messages to Gemini so the API key stays server-side.
"""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from auth import require_role, TokenData

router = APIRouter(prefix="/api/v1/nova", tags=["NOVA"])

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

NOVA_SYSTEM_PROMPT = """You are NOVA (Network Operations Virtual Assistant), an AI command assistant embedded in POLITECH — a real-time Police Command & Operations Dashboard for the Tumkur Region, Karnataka, India.

Your role:
- Be friendly, professional, and concise
- Help police dispatchers and officers with operational queries
- For greetings (hi, hello, how are you), respond warmly and briefly mention you can assist with live operations data
- For operational questions about live data (incidents, officers, duties), let the user know they can ask using natural commands like "who's available?", "show incidents", etc. — the frontend will fetch the live data
- For general policing, law enforcement, or Tumkur region questions, answer helpfully
- Keep responses under 4 sentences unless detail is genuinely needed
- Do NOT make up specific incident numbers, officer names, or live statistics

You operate in the Tumkur District, Karnataka. The system monitors officers, incidents, duties, and alerts in real-time."""


class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    text: str


class NovaChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


class NovaChatResponse(BaseModel):
    reply: str
    gemini_active: bool


@router.get("/status")
def nova_status(_: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst"))):
    """Check if Gemini is configured on the backend."""
    return {"gemini_configured": bool(GEMINI_KEY), "model": "gemini-2.0-flash"}


@router.post("/chat", response_model=NovaChatResponse)
async def nova_chat(
    body: NovaChatRequest,
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    if not GEMINI_KEY:
        raise HTTPException(status_code=503, detail="Gemini API not configured on server.")

    # Build contents array (conversation history + current message)
    contents = []
    for msg in (body.history or []):
        contents.append({
            "role": msg.role,
            "parts": [{"text": msg.text}]
        })
    contents.append({
        "role": "user",
        "parts": [{"text": body.message}]
    })

    payload = {
        "systemInstruction": {
            "parts": [{"text": NOVA_SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 512,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{GEMINI_URL}?key={GEMINI_KEY}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        if res.status_code == 429:
            raise HTTPException(status_code=429, detail="Gemini rate limit reached. Please wait a moment.")
        if not res.is_success:
            raise HTTPException(status_code=502, detail=f"Gemini error: {res.status_code}")

        data = res.json()
        reply = data["candidates"][0]["content"]["parts"][0]["text"]
        return NovaChatResponse(reply=reply.strip(), gemini_active=True)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini request timed out.")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Unexpected Gemini response format.")
