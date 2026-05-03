"""
schemas/alert.py — Pydantic v2 schemas for Alert.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class AlertCreate(BaseModel):
    type: Literal["critical", "warning", "info"]
    icon: Optional[str] = None
    title: str
    desc: Optional[str] = None


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    icon: Optional[str] = None
    title: str
    desc: Optional[str] = None
    time: Optional[datetime] = None

    @classmethod
    def from_orm_obj(cls, obj) -> "AlertOut":
        return cls(
            id=obj.id,
            type=obj.type,
            icon=obj.icon,
            title=obj.title,
            desc=obj.description,
            time=obj.time,
        )
