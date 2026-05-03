"""
schemas/incident.py — Pydantic v2 schemas for Incident.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class MapPos(BaseModel):
    lat: float
    lng: float


class IncidentCreate(BaseModel):
    type: str
    location: str
    priority: Literal["Low", "Medium", "High", "Critical"]
    mapPos: Optional[MapPos] = None


class IncidentUpdate(BaseModel):
    type: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[Literal["Low", "Medium", "High", "Critical"]] = None
    mapPos: Optional[MapPos] = None


class AssignOfficerRequest(BaseModel):
    officerId: int


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    location: str
    priority: str
    time: datetime
    assignedTo: Optional[str] = None
    assignedOfficerId: Optional[int] = None
    mapPos: Optional[MapPos] = None
    resolvedAt: Optional[datetime] = None
    createdAt: Optional[datetime] = None

    @classmethod
    def from_orm_obj(cls, obj) -> "IncidentOut":
        return cls(
            id=obj.id,
            type=obj.type,
            location=obj.location,
            priority=obj.priority,
            time=obj.time,
            assignedTo=obj.assigned_to,
            assignedOfficerId=obj.assigned_officer_id,
            mapPos=MapPos(lat=obj.lat, lng=obj.lng) if obj.lat is not None and obj.lng is not None else None,
            resolvedAt=obj.resolved_at,
            createdAt=obj.created_at,
        )
