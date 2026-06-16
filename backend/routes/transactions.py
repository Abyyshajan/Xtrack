"""
Transaction suggestions and inbox routing.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    TransactionDetectRequest, 
    PendingTransactionResponse, 
    ExpenseResponse
)
import crud
from parser import parse_message

# Define router for transaction suggestions inbox
router = APIRouter(prefix="/transactions", tags=["Transaction Inbox"])


@router.post("/detect", response_model=PendingTransactionResponse, status_code=201)
def detect_transaction(payload: TransactionDetectRequest, db: Session = Depends(get_db)):
    """Simulate receipt of a transaction message and register it in the suggestions inbox."""
    # Remove leading/trailing whitespaces from the SMS text message
    msg = payload.message.strip()
    # Reject the request if the message content is empty
    if not msg:
        raise HTTPException(status_code=400, detail="Transaction message cannot be empty")
    
    # Run offline parsing on the message to extract amount, merchant, category, and date
    parsed = parse_message(msg)
    
    # Bundle the parsed transaction fields for the CRUD insertion helper
    pt_data = {
        "merchant": parsed.get("title") or None,
        "amount": parsed.get("amount"),
        "category": parsed.get("category", "Other"),
        "transaction_date": parsed.get("date"),
        "raw_message": msg
    }
    
    # Create the suggestion entry in the pending_transactions table and return it
    return crud.create_pending_transaction(db, pt_data)


@router.get("/pending", response_model=list[PendingTransactionResponse])
def list_pending_transactions(db: Session = Depends(get_db)):
    """List all pending transaction suggestions in the inbox."""
    # Query database for suggestions where status = 'pending', ordered by newest first
    return crud.get_pending_transactions(db)


@router.post("/{id}/accept", response_model=ExpenseResponse)
def accept_transaction(id: int, db: Session = Depends(get_db)):
    """Accept a pending suggestion, creating a real Expense entry and updating status."""
    # Find the suggestion by its ID
    pt = crud.get_pending_transaction(db, id)
    if not pt:
        raise HTTPException(status_code=404, detail=f"Pending transaction with ID {id} not found")
        
    # Prevent duplicate actions: can't accept/ignore an already processed suggestion
    if pt.status == "accepted":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been accepted")
    elif pt.status == "ignored":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been ignored")
        
    # Promote suggestion to an actual Expense entry, update status to 'accepted' in DB, and save
    return crud.accept_pending_transaction(db, pt)


@router.post("/{id}/ignore", response_model=PendingTransactionResponse)
def ignore_transaction(id: int, db: Session = Depends(get_db)):
    """Mark a suggestion as ignored so it disappears from the inbox."""
    # Find the suggestion by its ID
    pt = crud.get_pending_transaction(db, id)
    if not pt:
        raise HTTPException(status_code=404, detail=f"Pending transaction with ID {id} not found")
        
    # Guard check: cannot ignore if already processed
    if pt.status == "accepted":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been accepted")
    elif pt.status == "ignored":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been ignored")
        
    # Update suggestion status to 'ignored' in the database and save
    return crud.ignore_pending_transaction(db, pt)

