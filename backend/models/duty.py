"""
models/duty.py — SQLAlchemy ORM model for duties.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from db import Base


class Duty(Base):
    __tablename__ = "duties"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(30), nullable=False)
    officer_id = Column(Integer, ForeignKey("officers.id"), nullable=False)
    officer_name = Column(String(100), nullable=True)
    location = Column(String(200), nullable=False)
    details = Column(Text, nullable=True)
    priority = Column(String(20), nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    officer = relationship("Officer", back_populates="duties")
