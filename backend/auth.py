"""
auth.py - JWT authentication, password hashing, role-based access control.
Uses bcrypt directly (compatible with Python 3.14).
"""
import os
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "politech_secret_key_change_me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

bearer_scheme = HTTPBearer(auto_error=False)


def _hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── In-memory user store ──────────────────────────────────────────────────────
USERS_DB = {
    "admin":      {"id": 1, "username": "admin",      "hashed_password": _hash_pw("admin123"),    "role": "admin"},
    "dispatcher": {"id": 2, "username": "dispatcher", "hashed_password": _hash_pw("dispatch123"), "role": "dispatcher"},
    "officer":    {"id": 3, "username": "officer",    "hashed_password": _hash_pw("officer123"),  "role": "officer"},
    "analyst":    {"id": 4, "username": "analyst",    "hashed_password": _hash_pw("analyst123"),  "role": "analyst"},
}


class TokenData(BaseModel):
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRY_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> TokenData:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if not username or not role:
            raise JWTError()
        return TokenData(username=username, role=role)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(*allowed_roles: str):
    """Dependency factory - raises 403 if user's role is not allowed."""
    def _check(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' not permitted. Required: {list(allowed_roles)}",
            )
        return current_user
    return _check
