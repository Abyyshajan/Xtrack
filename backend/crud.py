"""
CRUD operations — all database logic lives here, keeping routes thin.
"""

import datetime as dt
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Expense, CategoryEnum, PendingTransaction, StatusEnum


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_expense(db: Session, data: dict) -> Expense:
    """Create and persist a new expense from validated schema data."""
    # Instantiate ORM class using the provided key-value arguments
    expense = Expense(**data)
    # Add new record to database session transaction
    db.add(expense)
    # Commit transaction to database to persist the record
    db.commit()
    # Refresh instance properties (like ID and timestamps) from database
    db.refresh(expense)
    return expense


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_expense(db: Session, expense_id: int) -> Optional[Expense]:
    """Fetch an expense by its unique database ID primary key."""
    return db.query(Expense).filter(Expense.id == expense_id).first()


def _escape_like(term: str) -> str:
    """Escape SQL LIKE wildcards so literal %, _ characters are matched."""
    # Prevent SQL LIKE wildcard injection by escaping backslashes, percent signs, and underscores
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def get_expenses(
    db: Session,
    *,
    category: Optional[CategoryEnum] = None,
    title: Optional[str] = None,
    from_date: Optional[dt.date] = None,
    to_date: Optional[dt.date] = None,
) -> list[Expense]:
    """Retrieve filtered list of expenses sorted by date desc and id desc."""
    # Prepare query on the Expense model
    query = db.query(Expense)

    # Apply category filter if requested
    if category is not None:
        query = query.filter(Expense.category == category)
    # Apply title case-insensitive partial match filter if requested
    if title is not None:
        safe_title = _escape_like(title)
        query = query.filter(Expense.title.ilike(f"%{safe_title}%", escape="\\"))
    # Apply start date filter if requested
    if from_date is not None:
        query = query.filter(Expense.date >= from_date)
    # Apply end date filter if requested
    if to_date is not None:
        query = query.filter(Expense.date <= to_date)

    # Sort results primarily by date descending, then secondary by ID descending
    return query.order_by(Expense.date.desc(), Expense.id.desc()).all()


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def update_expense(db: Session, expense: Expense, updates: dict) -> Expense:
    """Apply updates to an expense. Handles explicit None values (e.g. clearing note)."""
    # Set attributes dynamically based on provided patch payload
    for key, value in updates.items():
        setattr(expense, key, value)
    # Save updates to the DB
    db.commit()
    # Reload model from the database to obtain final database state
    db.refresh(expense)
    return expense


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_expense(db: Session, expense: Expense) -> None:
    """Delete a specific expense record from the DB."""
    # Remove the entity from database tracking
    db.delete(expense)
    # Commit changes to make deletion permanent
    db.commit()


# ---------------------------------------------------------------------------
# Monthly summary
# ---------------------------------------------------------------------------

def get_monthly_summary(db: Session, year: int, month: int) -> dict:
    """Return total spent and per-category breakdown for a given month."""
    # Retrieve categories aggregated totals and counts for the specified year/month
    rows = (
        db.query(
            Expense.category,
            func.sum(Expense.amount).label("total"),
            func.count(Expense.id).label("cnt"),
        )
        .filter(func.strftime("%Y", Expense.date) == str(year))
        .filter(func.strftime("%m", Expense.date) == f"{month:02d}")
        .group_by(Expense.category)
        .all()
    )

    breakdown: dict[str, float] = {}
    total = 0.0
    count = 0
    # Process each grouped category aggregation row
    for cat, cat_total, cat_count in rows:
        amt = float(cat_total)
        # Store individual category total rounded to two decimal places
        breakdown[cat.value] = round(amt, 2)
        total += amt
        count += cat_count

    # Package overall metrics summary for the month
    return {
        "month": f"{year:04d}-{month:02d}",
        "total": round(total, 2),
        "breakdown": breakdown,
        "count": count,
    }


# ---------------------------------------------------------------------------
# Pending Transactions (Inbox Suggestions)
# ---------------------------------------------------------------------------

def create_pending_transaction(db: Session, data: dict) -> PendingTransaction:
    """Create a new pending transaction suggestion from parsed message details."""
    date_val = data.get("transaction_date")
    # If date_val is a string (e.g. from JSON payload), convert it to date object
    if isinstance(date_val, str):
        try:
            date_val = dt.datetime.strptime(date_val, "%Y-%m-%d").date()
        except ValueError:
            date_val = dt.date.today()
    elif not date_val:
        date_val = dt.date.today()

    # Create new suggestions inbox entry
    pt = PendingTransaction(
        merchant=data.get("merchant"),
        amount=data.get("amount"),
        category=CategoryEnum(data.get("category", "Other")),
        transaction_date=date_val,
        raw_message=data.get("raw_message", ""),
        status=StatusEnum.pending
    )
    # Add to DB session transaction
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


def get_pending_transactions(db: Session) -> list[PendingTransaction]:
    """Retrieve all suggestions currently in pending status."""
    # Fetch suggestions pending user actions, ordered by creation date descending
    return db.query(PendingTransaction).filter(PendingTransaction.status == StatusEnum.pending).order_by(PendingTransaction.created_at.desc()).all()


def get_pending_transaction(db: Session, transaction_id: int) -> Optional[PendingTransaction]:
    """Retrieve a single suggestion by its primary key ID."""
    return db.query(PendingTransaction).filter(PendingTransaction.id == transaction_id).first()


def accept_pending_transaction(db: Session, pt: PendingTransaction) -> Expense:
    """Convert a suggestion to an actual Expense entry and mark it accepted."""
    # Update state of suggestion to accepted
    pt.status = StatusEnum.accepted
    
    # Establish fallback name and amount if parsed suggestion was incomplete
    title = pt.merchant or "Unknown Merchant"
    amount = pt.amount if pt.amount is not None else 0.0

    # Instantiate real expense entry copying over suggestion details
    expense = Expense(
        title=title,
        amount=amount,
        category=pt.category,
        date=pt.transaction_date,
        note=f"Parsed from: {pt.raw_message}"
    )
    # Persist the new expense inside the same transaction
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def ignore_pending_transaction(db: Session, pt: PendingTransaction) -> PendingTransaction:
    """Mark a suggestion as ignored."""
    # Modify state of suggestion to ignored so it doesn't show in the inbox
    pt.status = StatusEnum.ignored
    db.commit()
    db.refresh(pt)
    return pt


