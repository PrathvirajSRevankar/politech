"""
models/officer.py — SQLAlchemy ORM model for officers.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from db import Base


class Officer(Base):
    __tablename__ = "officers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    rank = Column(String(50), nullable=False)
    badge = Column(String(20), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default="available")
    last_seen = Column(DateTime, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    duties = relationship("Duty", back_populates="officer", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="assigned_officer")
