"""
routers/duties.py — CRUD + complete endpoints for duties.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db import get_db
from auth import require_role, TokenData
from models.duty import Duty
from models.officer import Officer
from schemas.duty import DutyCreate, DutyUpdate, DutyOut
from routers.ws import broadcast_ws

router = APIRouter(prefix="/api/v1/duties", tags=["Duties"])


def _to_out(d: Duty) -> DutyOut:
    return DutyOut.from_orm_obj(d)


@router.get("", response_model=List[DutyOut])
def list_duties(
    completed: Optional[bool] = Query(None),
    officerId: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    q = db.query(Duty).order_by(Duty.created_at.desc())
    if completed is not None:
        q = q.filter(Duty.completed == completed)
    if officerId is not None:
        q = q.filter(Duty.officer_id == officerId)
    if type is not None:
        q = q.filter(Duty.type == type)
    return [_to_out(d) for d in q.all()]


@router.post("", response_model=DutyOut, status_code=status.HTTP_201_CREATED)
async def create_duty(
    body: DutyCreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    officer = db.query(Officer).filter(Officer.id == body.officerId).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
    if officer.status != "available":
        raise HTTPException(status_code=400, detail="Officer is not available")

    # Update officer status
    officer.status = "assigned"
    officer.last_seen = datetime.now(timezone.utc)

    duty = Duty(
        type=body.type,
        officer_id=officer.id,
        officer_name=officer.name,
        location=body.location,
        details=body.details,
        priority=body.priority,
        completed=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(duty)
    db.commit()
    db.refresh(duty)
    db.refresh(officer)

    out = _to_out(duty)
    await broadcast_ws("officer:status_changed", {
        "officerId": officer.id,
        "status": officer.status,
        "lastSeen": officer.last_seen.isoformat() if officer.last_seen else None,
    })
    await broadcast_ws("duty:created", out.model_dump(mode="json"))
    return out


@router.patch("/{duty_id}", response_model=DutyOut)
def update_duty(
    duty_id: int,
    body: DutyUpdate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    duty = db.query(Duty).filter(Duty.id == duty_id).first()
    if not duty:
        raise HTTPException(status_code=404, detail="Duty not found")
    if body.type is not None:
        duty.type = body.type
    if body.location is not None:
        duty.location = body.location
    if body.details is not None:
        duty.details = body.details
    if body.priority is not None:
        duty.priority = body.priority
    db.commit()
    db.refresh(duty)
    return _to_out(duty)


@router.patch("/{duty_id}/complete", response_model=DutyOut)
async def complete_duty(
    duty_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    duty = db.query(Duty).filter(Duty.id == duty_id).first()
    if not duty:
        raise HTTPException(status_code=404, detail="Duty not found")

    now = datetime.now(timezone.utc)
    duty.completed = True
    duty.completed_at = now

    officer = db.query(Officer).filter(Officer.id == duty.officer_id).first()
    if officer:
        officer.status = "available"
        officer.last_seen = now

    db.commit()
    db.refresh(duty)

    out = _to_out(duty)
    await broadcast_ws("duty:completed", {
        "dutyId": duty.id,
        "officerId": duty.officer_id,
    })
    if officer:
        await broadcast_ws("officer:status_changed", {
            "officerId": officer.id,
            "status": officer.status,
            "lastSeen": officer.last_seen.isoformat() if officer.last_seen else None,
        })
    return out


@router.delete("/{duty_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_duty(
    duty_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    duty = db.query(Duty).filter(Duty.id == duty_id).first()
    if not duty:
        raise HTTPException(status_code=404, detail="Duty not found")

    # Return officer to available if duty was active
    if not duty.completed:
        officer = db.query(Officer).filter(Officer.id == duty.officer_id).first()
        if officer:
            officer.status = "available"
            officer.last_seen = datetime.now(timezone.utc)

    duty_id_val = duty.id
    officer_id_val = duty.officer_id
    db.delete(duty)
    db.commit()

    await broadcast_ws("duty:deleted", {"dutyId": duty_id_val})
    await broadcast_ws("officer:status_changed", {
        "officerId": officer_id_val,
        "status": "available",
        "lastSeen": datetime.now(timezone.utc).isoformat(),
    })
