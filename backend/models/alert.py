"""
models/alert.py — SQLAlchemy ORM model for command center alerts.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from db import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(20), nullable=False)
    icon = Column(String(60), nullable=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    time = Column(DateTime, default=datetime.utcnow)
