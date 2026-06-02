# XTrack

A premium, interview-ready **XTrack** (Personal Expense Tracker) application built with a FastAPI backend and a clean, responsive vanilla HTML/CSS/JavaScript frontend. It features real-time monthly spending insights, robust visual analytics, a responsive list view with dynamic debounced filtering, and a resilient, fully validated CRUD workflow.

---

## 📂 Project Structure

```
xtrack/
├── backend/
│   ├── routes/
│   │   ├── __init__.py
│   │   └── expenses.py      # Thin API endpoints & query parsing
│   ├── crud.py              # Central database query operations
│   ├── database.py          # SQLAlchemy engine, session maker & local database path
│   ├── main.py              # FastAPI startup, middleware & routes registration
│   ├── models.py            # SQLAlchemy database schemas & category enum
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── expense.db           # Local SQLite database (auto-created)
│   └── README.md            # Backend-specific architecture notes
└── frontend/
    ├── app.js               # Dynamic interaction, Chart.js, input validations & event handling
    ├── index.html           # Semantically structured responsive layout
    └── styles.css           # Modern layered CSS with gradients and glassmorphism
```

---

## 🚀 Quick Start / Run Instructions

### 1. Run the Backend API

Make sure Python (3.10+) is installed.

```bash
# Navigate to the backend directory
cd backend

# Install required packages
pip install fastapi uvicorn sqlalchemy pydantic

# Start the development server
uvicorn main:app --reload --port 8000
```
- API will be active at: **`http://127.0.0.1:8000`**
- Interactive Swagger docs: **`http://127.0.0.1:8000/docs`**

### 2. Serve the Frontend Web App

Serve the frontend using any lightweight static web server so that API calls are resolved correctly.

```bash
# Navigate to the frontend directory
cd frontend

# Start a simple Python static web server
python -m http.server 3000
```
- Open your browser to: **`http://127.0.0.1:3000`**

---

## 🎯 Requirements Analysis & Completed Features

| Category | Requirements | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Backend** | Robust CRUD API | ✅ Done | FastAPI endpoints supporting POST (create), GET (read), PUT (update), and DELETE (delete). |
| | Filtering System | ✅ Done | Dynamic composable queries filtering by category, debounced title searches, and inclusive start/end date ranges. |
| | Monthly Summary | ✅ Done | Dedicated `/expenses/summary` API computing current-month totals, category aggregates, and item counts. |
| **Frontend** | Modern Layout & Design | ✅ Done | Rich typography, glassmorphism layouts, vibrant color-themed badges, and seamless column scaling. |
| | Data Visualization | ✅ Done | Clean, responsive Chart.js doughnut chart matching category colors, with dynamic tooltips and automatic empty-state updates. |
| | Input & State Sync | ✅ Done | Immediate state reload after saving/deleting expenses, concurrent data fetching via `Promise.all()`, and double-submission protection. |
| | Accessibility & UX | ✅ Done | Safe text extraction, ARIA live-regions for alerts, character counters for note inputs, and auto-clearing validation errors. |

---

## 🛠️ Tradeoffs Made

Due to the, specific decisions were made to prioritize modularity, usability, and speed without sacrificing architectural integrity:
1. **SQLite Database Model**: SQLite was selected over PostgreSQL because it requires zero local setup, zero credential configuration, and stores data in a simple, portable local file (`expense.db`), making it extremely simple to deploy and evaluate immediately.
2. **Client-Side/Memory Charting**: The doughnut charts and category aggregations are compiled on the server per request, but rendered client-side dynamically. This avoids heavy server-side chart rendering and keeps network payloads light.
3. **No Heavy Frontend Frameworks (React/Vue)**: Built using standard vanilla JavaScript, HTML5, and standard Bootstrap 5. This eliminated compilation pipelines (Vite/Webpack), reducing dependencies to zero and assuring immediate, zero-lag browser testing.
4. **FastAPI Default Autocommit & Auto-Migrations**: SQLAlchemy's `Base.metadata.create_all` dynamically handles model generation on initial startup. For production projects, database migrations should instead be rigorously tracked using **Alembic**.

---

## 🔮 Future Production Improvements

To elevate this codebase to a high-scale production standard, the following features would be implemented next:
* **User Authentication & Isolation**: Add multi-tenant isolation with JSON Web Tokens (JWT) or OAuth2, ensuring users can only view and manage their own expenses.
* **Database Migration Pipeline**: Integrate **Alembic** to manage future database schema evolutions safely without losing client transaction histories.
* **Database Scale**: Migrate from SQLite to PostgreSQL to handle high concurrency, indexing, and scalable read/write transactions.
* **Paged / Windowed Queries**: Add cursor-based or limit-offset server-side pagination for `/expenses/` lists to prevent browser rendering lag once databases grow to tens of thousands of records.
* **Testing Suite**: Implement backend unit/integration tests using `pytest` and frontend interface automation using `Playwright` or `Cypress`.
