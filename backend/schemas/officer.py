"""
schemas/officer.py — Pydantic v2 schemas for Officer.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class MapPos(BaseModel):
    lat: float
    lng: float


class OfficerCreate(BaseModel):
    name: str
    rank: str
    badge: str
    status: Literal["available", "assigned", "offduty"] = "available"
    lastSeen: Optional[datetime] = None
    mapPos: Optional[MapPos] = None


class OfficerUpdate(BaseModel):
    name: Optional[str] = None
    rank: Optional[str] = None
    badge: Optional[str] = None
    status: Optional[Literal["available", "assigned", "offduty"]] = None
    lastSeen: Optional[datetime] = None
    mapPos: Optional[MapPos] = None


class OfficerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rank: str
    badge: str
    status: str
    lastSeen: Optional[datetime] = None
    mapPos: Optional[MapPos] = None
    createdAt: Optional[datetime] = None

    @classmethod
    def from_orm_obj(cls, obj) -> "OfficerOut":
        return cls(
            id=obj.id,
            name=obj.name,
            rank=obj.rank,
            badge=obj.badge,
            status=obj.status,
            lastSeen=obj.last_seen,
            mapPos=MapPos(lat=obj.lat, lng=obj.lng) if obj.lat is not None and obj.lng is not None else None,
            createdAt=obj.created_at,
        )
