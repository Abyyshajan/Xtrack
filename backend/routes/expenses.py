"""
Expense API endpoints.
"""

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import CategoryEnum
from schemas import ExpenseCreate, ExpenseUpdate, ExpenseResponse, MonthlySummary
import crud

router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_expense_or_404(db: Session, expense_id: int) -> "Expense":
    expense = crud.get_expense(db, expense_id)
    if expense is None:
        raise HTTPException(status_code=404, detail=f"Expense with id {expense_id} not found")
    return expense


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/", response_model=ExpenseResponse, status_code=201)
def create_expense(payload: ExpenseCreate, db: Session = Depends(get_db)):
    """Create a new expense."""
    return crud.create_expense(db, payload.model_dump())


@router.get("/", response_model=list[ExpenseResponse])
def list_expenses(
    category: Optional[CategoryEnum] = Query(None, description="Filter by exact category"),
    title: Optional[str] = Query(None, description="Case-insensitive partial title match"),
    from_date: Optional[dt.date] = Query(None, description="Inclusive start date"),
    to_date: Optional[dt.date] = Query(None, description="Inclusive end date"),
    db: Session = Depends(get_db),
):
    """List expenses with optional filters. Sorted by most recent date first."""
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=400,
            detail="from_date must be on or before to_date",
        )
    return crud.get_expenses(db, category=category, title=title, from_date=from_date, to_date=to_date)


@router.get("/summary", response_model=MonthlySummary)
def monthly_summary(
    year: Optional[int] = Query(None, description="Year (defaults to current)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month 1-12 (defaults to current)"),
    db: Session = Depends(get_db),
):
    """Monthly spending summary — total + category breakdown."""
    today = dt.date.today()
    return crud.get_monthly_summary(db, year or today.year, month or today.month)


@router.get("/{expense_id}", response_model=ExpenseResponse)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    """Get a single expense by ID."""
    return _get_expense_or_404(db, expense_id)


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(expense_id: int, payload: ExpenseUpdate, db: Session = Depends(get_db)):
    """Update an existing expense. Only supplied fields are changed."""
    expense = _get_expense_or_404(db, expense_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    return crud.update_expense(db, expense, updates)


@router.delete("/{expense_id}", status_code=200)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    """Delete an expense."""
    expense = _get_expense_or_404(db, expense_id)
    crud.delete_expense(db, expense)
    return {"detail": f"Expense {expense_id} deleted"}
