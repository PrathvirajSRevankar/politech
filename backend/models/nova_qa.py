"""
models/nova_qa.py — SQLAlchemy model for NOVA Q&A knowledge base.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from db import Base


class NovaQA(Base):
    __tablename__ = "nova_qa"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category   = Column(String(50), nullable=False, default="general")
    question   = Column(Text, nullable=False)
    answer     = Column(Text, nullable=False)
    keywords   = Column(Text, nullable=True)   # comma-separated hint words
    created_at = Column(DateTime, default=datetime.utcnow)
