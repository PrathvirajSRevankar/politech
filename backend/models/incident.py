"""
models/incident.py — SQLAlchemy ORM model for incidents.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from db import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(100), nullable=False)
    location = Column(String(200), nullable=False)
    priority = Column(String(20), nullable=False)
    time = Column(DateTime, default=datetime.utcnow, nullable=False)
    assigned_officer_id = Column(Integer, ForeignKey("officers.id"), nullable=True)
    assigned_to = Column(String(100), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assigned_officer = relationship("Officer", back_populates="incidents")
