"""
Pydantic schemas for request validation and response serialization.
"""

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from models import CategoryEnum


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Expense title")
    amount: float = Field(..., gt=0, description="Must be greater than 0")
    category: CategoryEnum
    date: dt.date = Field(default_factory=dt.date.today)
    note: Optional[str] = Field(None, max_length=1000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be blank or whitespace-only")
        return v.strip()


class ExpenseUpdate(BaseModel):
    """All fields optional — only supplied fields are updated."""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, gt=0)
    category: Optional[CategoryEnum] = None
    date: Optional[dt.date] = None
    note: Optional[str] = Field(None, max_length=1000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Title cannot be blank or whitespace-only")
        return v.strip() if v else v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class ExpenseResponse(BaseModel):
    id: int
    title: str
    amount: float
    category: CategoryEnum
    date: dt.date
    note: Optional[str]
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class MonthlySummary(BaseModel):
    """Monthly spending overview — total + per-category breakdown."""
    month: str  # e.g. "2026-06"
    total: float
    breakdown: dict[str, float]  # category -> sum
    count: int


# ---------------------------------------------------------------------------
# Smart Parser schemas
# ---------------------------------------------------------------------------

class TransactionParseRequest(BaseModel):
    message: str = Field(..., description="Raw transaction message or SMS")


class TransactionParseResponse(BaseModel):
    title: str = Field(..., description="Extracted merchant or title")
    amount: Optional[float] = Field(None, description="Extracted transaction amount")
    category: CategoryEnum = Field(..., description="Inferred category")
    date: dt.date = Field(..., description="Extracted date or today's date")

