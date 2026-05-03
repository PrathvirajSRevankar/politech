"""
routers/stats.py — Live stats endpoint for the dashboard stats bar.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from db import get_db
from auth import require_role, TokenData
from models.officer import Officer
from models.duty import Duty
from models.incident import Incident

router = APIRouter(prefix="/api/v1", tags=["Stats"])


def compute_stats(db: Session) -> dict:
    today = datetime.now(timezone.utc).date()

    active_duties = db.query(func.count(Duty.id)).filter(Duty.completed == False).scalar() or 0
    officers_available = db.query(func.count(Officer.id)).filter(Officer.status == "available").scalar() or 0
    officers_deployed = db.query(func.count(Officer.id)).filter(Officer.status == "assigned").scalar() or 0
    completed_today = (
        db.query(func.count(Duty.id))
        .filter(
            Duty.completed == True,
            func.date(Duty.completed_at) == today,
        )
        .scalar() or 0
    )
    total_incidents = db.query(func.count(Incident.id)).scalar() or 0

    return {
        "activeDuties": active_duties,
        "officersAvailable": officers_available,
        "officersDeployed": officers_deployed,
        "completedToday": completed_today,
        "totalIncidents": total_incidents,
    }


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    return compute_stats(db)
