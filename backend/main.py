"""
FastAPI application entry point.

Starts the app, creates DB tables, registers routers,
and adds CORS middleware for frontend consumption.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routes.expenses import router as expenses_router

# Create all tables on startup (idempotent)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="XTrack",
    description="A clean CRUD API for tracking personal expenses.",
    version="1.0.0",
)

# CORS — allow any origin during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses_router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "XTrack API is running"}
