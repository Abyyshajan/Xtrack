"""
SQLAlchemy ORM models.
"""

import enum

from sqlalchemy import Column, Date, DateTime, Enum, Integer, Numeric, String, Text, func

from database import Base


class CategoryEnum(str, enum.Enum):
    """Allowed expense categories."""
    Food = "Food"
    Transport = "Transport"
    Shopping = "Shopping"
    Bills = "Bills"
    Entertainment = "Entertainment"
    Other = "Other"


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    category = Column(Enum(CategoryEnum), nullable=False)
    date = Column(Date, nullable=False, server_default=func.current_date())
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class StatusEnum(str, enum.Enum):
    """Status for suggestions in the inbox."""
    pending = "pending"
    accepted = "accepted"
    ignored = "ignored"


class PendingTransaction(Base):
    __tablename__ = "pending_transactions"

    id = Column(Integer, primary_key=True, index=True)
    merchant = Column(String(100), nullable=True)
    amount = Column(Numeric(10, 2), nullable=True)
    category = Column(Enum(CategoryEnum), nullable=False, default=CategoryEnum.Other)
    transaction_date = Column(Date, nullable=False, server_default=func.current_date())
    raw_message = Column(Text, nullable=False)
    status = Column(Enum(StatusEnum), nullable=False, default=StatusEnum.pending)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

