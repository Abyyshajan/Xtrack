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

router = APIRouter(prefix="/transactions", tags=["Transaction Inbox"])


@router.post("/detect", response_model=PendingTransactionResponse, status_code=201)
def detect_transaction(payload: TransactionDetectRequest, db: Session = Depends(get_db)):
    """Simulate receipt of a transaction message and register it in the suggestions inbox."""
    msg = payload.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Transaction message cannot be empty")
    
    parsed = parse_message(msg)
    
    # Store suggestion in DB
    pt_data = {
        "merchant": parsed.get("title") or None,
        "amount": parsed.get("amount"),
        "category": parsed.get("category", "Other"),
        "transaction_date": parsed.get("date"),
        "raw_message": msg
    }
    
    return crud.create_pending_transaction(db, pt_data)


@router.get("/pending", response_model=list[PendingTransactionResponse])
def list_pending_transactions(db: Session = Depends(get_db)):
    """List all pending transaction suggestions in the inbox."""
    return crud.get_pending_transactions(db)


@router.post("/{id}/accept", response_model=ExpenseResponse)
def accept_transaction(id: int, db: Session = Depends(get_db)):
    """Accept a pending suggestion, creating a real Expense entry and updating status."""
    pt = crud.get_pending_transaction(db, id)
    if not pt:
        raise HTTPException(status_code=404, detail=f"Pending transaction with ID {id} not found")
        
    if pt.status == "accepted":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been accepted")
    elif pt.status == "ignored":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been ignored")
        
    return crud.accept_pending_transaction(db, pt)


@router.post("/{id}/ignore", response_model=PendingTransactionResponse)
def ignore_transaction(id: int, db: Session = Depends(get_db)):
    """Mark a suggestion as ignored so it disappears from the inbox."""
    pt = crud.get_pending_transaction(db, id)
    if not pt:
        raise HTTPException(status_code=404, detail=f"Pending transaction with ID {id} not found")
        
    if pt.status == "accepted":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been accepted")
    elif pt.status == "ignored":
        raise HTTPException(status_code=400, detail="Transaction suggestion has already been ignored")
        
    return crud.ignore_pending_transaction(db, pt)
