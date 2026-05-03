"""
schemas/duty.py — Pydantic v2 schemas for Duty.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class DutyCreate(BaseModel):
    type: Literal["Patrol", "Investigation", "Traffic", "Desk", "Emergency"]
    officerId: int
    location: str
    details: Optional[str] = None
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"


class DutyUpdate(BaseModel):
    type: Optional[Literal["Patrol", "Investigation", "Traffic", "Desk", "Emergency"]] = None
    location: Optional[str] = None
    details: Optional[str] = None
    priority: Optional[Literal["Low", "Medium", "High", "Critical"]] = None


class DutyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    officerId: int
    officerName: Optional[str] = None
    location: str
    details: Optional[str] = None
    priority: str
    completed: bool
    createdAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None

    @classmethod
    def from_orm_obj(cls, obj) -> "DutyOut":
        return cls(
            id=obj.id,
            type=obj.type,
            officerId=obj.officer_id,
            officerName=obj.officer_name,
            location=obj.location,
            details=obj.details,
            priority=obj.priority,
            completed=obj.completed,
            createdAt=obj.created_at,
            completedAt=obj.completed_at,
        )
