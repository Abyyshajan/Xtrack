"""
FastAPI application entry point.

Starts the app, creates DB tables, registers routers,
and adds CORS middleware for frontend consumption.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from database import Base, engine
from models import CategoryEnum
from routes.expenses import router as expenses_router
from routes.transactions import router as transactions_router
from schemas import TransactionParseRequest, TransactionParseResponse
from parser import parse_message

# Create all database tables on startup (idempotent operation)
Base.metadata.create_all(bind=engine)

# Cleanup rows containing categories that were deleted from CategoryEnum in models.py
def cleanup_invalid_categories():
    """Removes orphan database entries with categories that are no longer valid in CategoryEnum."""
    # Retrieve valid enum values
    allowed = [c.value for c in CategoryEnum]
    if allowed:
        # Construct dynamically-bound SQL placeholder keys (e.g. :c0, :c1)
        placeholders = ", ".join(f":c{i}" for i in range(len(allowed)))
        params = {f"c{i}": val for i, val in enumerate(allowed)}
        # Open transaction connection block
        with engine.begin() as conn:
            # Delete any expenses mapped to deprecated categories
            conn.execute(
                text(f"DELETE FROM expenses WHERE category NOT IN ({placeholders})"),
                params
            )
            # Delete any pending transactions mapped to deprecated categories
            conn.execute(
                text(f"DELETE FROM pending_transactions WHERE category NOT IN ({placeholders})"),
                params
            )

# Run the category integrity cleanup at startup
cleanup_invalid_categories()

# Initialize FastAPI application instance
app = FastAPI(
    title="XTrack",
    description="A clean CRUD API for tracking personal expenses.",
    version="1.0.0",
)

# CORS Middleware config — permits frontend (running on different port/domain) to query backend safely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints routers for Expense entries and transaction Inbox suggestion streams
app.include_router(expenses_router)
app.include_router(transactions_router)


@app.post("/parse-transaction", response_model=TransactionParseResponse, tags=["AI Parser"])
def parse_transaction(payload: TransactionParseRequest):
    """Parse raw transaction messages to automatically extract expense properties."""
    # Hand off raw SMS message text directly to parser routines
    return parse_message(payload.message)


@app.get("/", tags=["Health"])
def root():
    """Simple healthcheck route."""
    return {"status": "ok", "message": "XTrack API is running"}

