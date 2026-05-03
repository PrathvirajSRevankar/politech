"""
routers/officers.py — CRUD endpoints for officers.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db import get_db
from auth import require_role, TokenData
from models.officer import Officer
from models.duty import Duty
from schemas.officer import OfficerCreate, OfficerUpdate, OfficerOut
from routers.ws import broadcast_ws

router = APIRouter(prefix="/api/v1/officers", tags=["Officers"])


def _to_out(o: Officer) -> OfficerOut:
    return OfficerOut.from_orm_obj(o)


@router.get("", response_model=List[OfficerOut])
def list_officers(
    status: Optional[str] = Query(None, description="Filter by status: available | assigned | offduty"),
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    q = db.query(Officer)
    if status:
        q = q.filter(Officer.status == status)
    return [_to_out(o) for o in q.all()]


@router.get("/{officer_id}", response_model=OfficerOut)
def get_officer(
    officer_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    o = db.query(Officer).filter(Officer.id == officer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Officer not found")
    return _to_out(o)


@router.post("", response_model=OfficerOut, status_code=status.HTTP_201_CREATED)
def create_officer(
    body: OfficerCreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    o = Officer(
        name=body.name,
        rank=body.rank,
        badge=body.badge,
        status=body.status,
        last_seen=body.lastSeen,
        lat=body.mapPos.lat if body.mapPos else None,
        lng=body.mapPos.lng if body.mapPos else None,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return _to_out(o)


@router.patch("/{officer_id}", response_model=OfficerOut)
async def update_officer(
    officer_id: int,
    body: OfficerUpdate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    o = db.query(Officer).filter(Officer.id == officer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Officer not found")

    old_status = o.status

    if body.name is not None:
        o.name = body.name
    if body.rank is not None:
        o.rank = body.rank
    if body.badge is not None:
        o.badge = body.badge
    if body.status is not None:
        o.status = body.status
    if body.lastSeen is not None:
        o.last_seen = body.lastSeen
    if body.mapPos is not None:
        o.lat = body.mapPos.lat
        o.lng = body.mapPos.lng

    # Business rule: assigned → available, auto-complete active duties
    if old_status == "assigned" and o.status == "available":
        active_duties = db.query(Duty).filter(
            Duty.officer_id == officer_id,
            Duty.completed == False,
        ).all()
        for d in active_duties:
            d.completed = True
            d.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(o)

    await broadcast_ws("officer:status_changed", {
        "officerId": o.id,
        "status": o.status,
        "lastSeen": o.last_seen.isoformat() if o.last_seen else None,
    })

    return _to_out(o)


@router.delete("/{officer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_officer(
    officer_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    o = db.query(Officer).filter(Officer.id == officer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Officer not found")

    # Complete all active duties before deleting
    for d in db.query(Duty).filter(Duty.officer_id == officer_id, Duty.completed == False).all():
        d.completed = True
        d.completed_at = datetime.now(timezone.utc)

    db.delete(o)
    db.commit()
