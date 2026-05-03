"""
routers/alerts.py — CRUD endpoints for Command Center alerts.
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from auth import require_role, TokenData
from models.alert import Alert
from schemas.alert import AlertCreate, AlertOut
from routers.ws import broadcast_ws

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


def _to_out(a: Alert) -> AlertOut:
    return AlertOut.from_orm_obj(a)


@router.get("", response_model=List[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("officer", "dispatcher", "admin", "analyst")),
):
    alerts = db.query(Alert).order_by(Alert.time.desc()).all()
    return [_to_out(a) for a in alerts]


@router.post("", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
async def create_alert(
    body: AlertCreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("dispatcher", "admin")),
):
    alert = Alert(
        type=body.type,
        icon=body.icon,
        title=body.title,
        description=body.desc,
        time=datetime.now(timezone.utc),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    out = _to_out(alert)
    await broadcast_ws("alert:new", out.model_dump(mode="json"))
    return out


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(require_role("admin")),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
