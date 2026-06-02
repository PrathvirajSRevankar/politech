"""
main.py — FastAPI application entry point for POLITECH backend.
"""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Import DB and models (so create_all can find them)
from db import engine, Base
import models.officer   # noqa: F401
import models.incident  # noqa: F401
import models.duty      # noqa: F401
import models.alert     # noqa: F401

# Import routers
from routers import ws, officers, incidents, duties, alerts, stats, analytics, nova
from auth import USERS_DB, LoginRequest, TokenResponse, create_access_token, verify_password
from fastapi import HTTPException, status

# ── Build the allowed origins list from env ──────────────────────────────────
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:5500")
ALLOWED_ORIGINS = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",")]

# ── Create FastAPI app ────────────────────────────────────────────────────────
app = FastAPI(
    title="POLITECH API",
    version="1.0",
    description="Police Command & Operations backend for POLITECH dashboard",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup — create all tables ───────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    print("[OK] Database tables created / verified.")


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Auth login ────────────────────────────────────────────────────────────────
@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(body: LoginRequest):
    user = USERS_DB.get(body.username)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(access_token=token, token_type="bearer", role=user["role"])


# ── Include all routers ───────────────────────────────────────────────────────
app.include_router(officers.router)
app.include_router(incidents.router)
app.include_router(duties.router)
app.include_router(alerts.router)
app.include_router(stats.router)
app.include_router(analytics.router)
app.include_router(nova.router)     # NOVA AI chat proxy
app.include_router(ws.router)   # WebSocket at /ws (no api/v1 prefix)
