"""
routers/incidents.py — CRUD + assign/resolve endpoints for incidents.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db import get_db
from auth import require_role, TokenData
from models.incident import Incident
from models.officer import Officer
from models.duty import Duty
from schemas.incident import IncidentCreate, IncidentUpdate, IncidentOut, AssignOfficerRequest
from routers.ws import broadcast_ws

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


def _to_out(i: Incident) -> IncidentOut:
    return IncidentOut.from_orm_obj(i)


@router.get("", response_model=List[IncidentOut])
def list_incidents(
    assigned: Optional[bool] = Query(None, description="Filter assigned (true) or unassigned (false)"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    q = db.query(Incident).order_by(Incident.time.desc())
    if assigned is True:
        q = q.filter(Incident.assigned_officer_id.isnot(None))
    elif assigned is False:
        q = q.filter(Incident.assigned_officer_id.is_(None))
    if priority:
        q = q.filter(Incident.priority == priority)
    return [_to_out(i) for i in q.limit(limit).all()]


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    i = db.query(Incident).filter(Incident.id == incident_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _to_out(i)


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    now = datetime.now(timezone.utc)
    i = Incident(
        type=body.type,
        location=body.location,
        priority=body.priority,
        time=now,
        lat=body.mapPos.lat if body.mapPos else None,
        lng=body.mapPos.lng if body.mapPos else None,
    )
    db.add(i)
    db.commit()
    db.refresh(i)

    out = _to_out(i)
    await broadcast_ws("incident:new", out.model_dump(mode="json"))
    return out


@router.patch("/{incident_id}/assign", response_model=IncidentOut)
async def assign_officer(
    incident_id: int,
    body: AssignOfficerRequest,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    officer = db.query(Officer).filter(Officer.id == body.officerId).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
    if officer.status != "available":
        raise HTTPException(status_code=400, detail="Officer is not available")

    # 1. Assign officer to incident
    incident.assigned_officer_id = officer.id
    incident.assigned_to = officer.name

    # 2. Update officer status
    officer.status = "assigned"
    officer.last_seen = datetime.now(timezone.utc)

    # 3. Auto-create Emergency duty
    duty = Duty(
        type="Emergency",
        officer_id=officer.id,
        officer_name=officer.name,
        location=incident.location,
        details=incident.type,
        priority=incident.priority,
        completed=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(duty)
    db.commit()
    db.refresh(incident)
    db.refresh(officer)
    db.refresh(duty)

    # 4. Broadcast events
    await broadcast_ws("incident:assigned", {
        "incidentId": incident.id,
        "officerId": officer.id,
        "officerName": officer.name,
    })
    await broadcast_ws("officer:status_changed", {
        "officerId": officer.id,
        "status": officer.status,
        "lastSeen": officer.last_seen.isoformat() if officer.last_seen else None,
    })
    await broadcast_ws("duty:created", {
        "id": duty.id,
        "type": duty.type,
        "officerId": duty.officer_id,
        "officerName": duty.officer_name,
        "location": duty.location,
        "priority": duty.priority,
    })

    return _to_out(incident)


@router.patch("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(incident)

    await broadcast_ws("incident:resolved", {"incidentId": incident.id})
    return _to_out(incident)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(incident)
    db.commit()
