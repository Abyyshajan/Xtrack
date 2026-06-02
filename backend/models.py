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
