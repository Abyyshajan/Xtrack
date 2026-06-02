# Personal Expense Tracker — Backend API

A clean, production-quality CRUD API for tracking personal expenses.
Built with **FastAPI + SQLAlchemy + SQLite**.

---

## Quick Start

```bash
# 1. Install dependencies
pip install fastapi uvicorn sqlalchemy pydantic

# 2. Run the server
cd backend
uvicorn main:app --reload
```

The API is now live at **http://127.0.0.1:8000**

Interactive docs at **http://127.0.0.1:8000/docs** (Swagger UI)

---

## Stack Choices & Rationale

| Choice          | Why                                                                 |
|-----------------|---------------------------------------------------------------------|
| **FastAPI**     | Built-in validation via Pydantic, auto-generated OpenAPI docs, async-ready |
| **SQLAlchemy**  | Mature ORM, clean model definitions, easy to swap DB later          |
| **SQLite**      | Zero-config, file-based — perfect for local dev and the 2-hour constraint |
| **Pydantic v2** | Field-level validation with `Field()` and `@field_validator` keeps schemas declarative |

---

## Project Structure

```
backend/
├── main.py              # App init, CORS, router registration
├── database.py          # Engine, session factory, get_db dependency
├── models.py            # SQLAlchemy ORM model + category enum
├── schemas.py           # Pydantic request/response schemas
├── crud.py              # All database operations
├── routes/
│   ├── __init__.py
│   └── expenses.py      # Thin API endpoints
└── expense.db           # Auto-created on first run
```

**Separation of concerns:**
- Routes are thin — they validate input and return responses
- Business/DB logic lives in `crud.py`
- Validation rules are declarative in `schemas.py`
- No business logic in endpoints, no DB logic in schemas

---

## API Endpoints

### Expenses CRUD

| Method   | Endpoint             | Description                    |
|----------|----------------------|--------------------------------|
| `POST`   | `/expenses/`         | Create a new expense           |
| `GET`    | `/expenses/`         | List all (with optional filters) |
| `GET`    | `/expenses/{id}`     | Get single expense             |
| `PUT`    | `/expenses/{id}`     | Update expense                 |
| `DELETE` | `/expenses/{id}`     | Delete expense                 |
| `GET`    | `/expenses/summary`  | Monthly summary + breakdown    |

### Filtering (GET /expenses/)

All filters are optional and composable:

| Param       | Type   | Behavior                         |
|-------------|--------|----------------------------------|
| `category`  | string | Exact match (Food, Transport, etc.) |
| `title`     | string | Case-insensitive partial match   |
| `from_date` | date   | `date >= from_date`              |
| `to_date`   | date   | `date <= to_date`                |

Results are always sorted by **most recent date first**.

### Monthly Summary (GET /expenses/summary)

| Param  | Type | Default       |
|--------|------|---------------|
| `year` | int  | Current year  |
| `month`| int  | Current month |

Returns: `{ month, total, breakdown: {category: sum}, count }`

---

## Data Model

```
Expense {
    id:         integer   (PK, auto-increment)
    title:      string    (required, max 100 chars)
    amount:     float     (required, > 0)
    category:   enum      (Food | Transport | Shopping | Bills | Entertainment | Other)
    date:       date      (defaults to today)
    note:       text      (optional, max 1000 chars)
    created_at: datetime  (auto-set)
    updated_at: datetime  (auto-set on create and update)
}
```

---

## Validation & Edge Cases Handled

- **Empty/whitespace title** → 422 with clear message
- **Negative or zero amount** → 422
- **Invalid category** → 422 with allowed values listed
- **`from_date > to_date`** → 400 Bad Request
- **Expense not found** → 404 with message
- **Empty database** → returns `[]` (not an error)
- **Partial updates** → only supplied fields are changed (`exclude_unset=True`)
- **No fields in update body** → 400

---

## What's Done vs. Skipped

### ✅ Done
- Full CRUD with proper HTTP status codes (201, 200, 400, 404, 422)
- Composable query filters (category, title, date range)
- Monthly summary with category breakdown
- Input validation with meaningful error messages
- Auto-create tables on startup
- CORS enabled for frontend integration
- Swagger UI auto-generated at `/docs`
- Clean separation of concerns

### ⏭️ Skipped (intentionally, per test instructions)
- **Authentication** — not required
- **Deployment** — runs locally only
- **Test suite** — validated manually; endpoints are simple enough
- **Pagination** — premature for a personal tracker; trivial to add later
- **Frontend** — backend-only scope

---

## Known Rough Edges

1. **`updated_at` uses `datetime.utcnow`** — this is deprecated in Python 3.12+ in favor of timezone-aware datetimes, but works fine and avoids adding `pytz` as a dependency.
2. **SQLite `extract()` for monthly summary** — works with SQLAlchemy's func.extract on SQLite. If moving to Postgres, this would work identically.
3. **No pagination** — the list endpoint returns all matching expenses. For a personal tracker this is fine; for production scale, add `limit`/`offset` params.
