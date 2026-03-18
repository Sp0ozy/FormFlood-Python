# FormFlood — CLAUDE.md

## What this project is

FormFlood is a SaaS web app for bulk-submitting responses to Google Forms.
Users paste a form URL, configure response distributions per question, set a count
and delay, and the app runs submissions in the background via a Celery job queue.

Full PRD is in PRD.md. Read it if you need feature or data model details.

---

## Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| API         | FastAPI (async)                                 |
| Queue       | Celery + Redis                                  |
| Database    | PostgreSQL — SQLAlchemy 2.0 async + Alembic     |
| Auth        | FastAPI-Users (JWT, email/password)             |
| HTTP client | httpx (async)                                   |
| Frontend    | Next.js 14 App Router, TypeScript, Tailwind     |
| Local dev   | Docker Compose                                  |

---

## Project structure

formflood/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                # pydantic-settings, reads .env
│   │   ├── database.py              # async engine, get_async_session dependency
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── routers/                 # FastAPI routers (forms.py, jobs.py)
│   │   ├── services/
│   │   │   ├── form_parser/         # Parser + question type handlers
│   │   │   └── submission/          # engine.py + distribution.py
│   │   ├── worker/
│   │   │   ├── celery_app.py
│   │   │   └── tasks.py             # run_job Celery task
│   │   └── auth/users.py
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/app/                     # Next.js App Router pages
├── plans/                           # Write a plan here before every multi-file task
├── docker-compose.yml
├── PRD.md
└── CLAUDE.md

---

## Code rules

### Python (backend)
- Python 3.11+. Type hints on every function — args and return type. No bare `except`.
- Use `async`/`await` throughout. No sync DB calls inside async routes.
- SQLAlchemy 2.0 style only: `select()`, `session.execute()`, `await session.commit()`.
  Never use the legacy Query API.
- Pydantic v2 for all schemas. Use `model_config = ConfigDict(from_attributes=True)`.
- All config via `app/config.py` (pydantic-settings). No hardcoded strings, URLs, or secrets.
- Error responses: raise `HTTPException(status_code=X, detail="message")`.
- One Celery app instance in `worker/celery_app.py`. Import from there everywhere.
- DB session is a FastAPI dependency (`Annotated[AsyncSession, Depends(get_async_session)]`).
  Never instantiate sessions manually inside business logic.

### TypeScript (frontend)
- Strict mode. No `any`.
- All API calls go through `src/lib/api.ts` — never call fetch() directly in components.
- Loading and error states required for every async operation.

### General
- Never commit .env files.
- Every new migration gets a descriptive name: `alembic revision --autogenerate -m "add_job_cancel_status"`.
- No print() for debugging — use Python logging module.

---

## How Google Forms submission works

Parse target: FB_PUBLIC_LOAD_DATA_ JavaScript variable in the form HTML.

Steps:
1. httpx.get(form_url) with a realistic User-Agent header
2. Regex extract FB_PUBLIC_LOAD_DATA_ value from HTML
3. json.loads() the extracted string
4. Questions live at data[1][1] — list of question arrays
5. Each question: [entry_id, title, _, type_int, options, ...]
6. type_int mapping: 2=MULTIPLE_CHOICE, 3=DROPDOWN, 4=CHECKBOX

Submission:
- POST https://docs.google.com/forms/d/e/{FORM_ID}/formResponse
- Content-Type: application/x-www-form-urlencoded
- Keys: entry.XXXXXXX per question
- Checkboxes: pass a list under the same key (httpx handles this automatically)

---

## Question handler interface

All handlers live in app/services/form_parser/handlers/ and inherit BaseHandler:

    class BaseHandler(ABC):
        def parse_options(self, raw_data: list) -> list[str]: ...
        def generate_responses(self, config: dict, count: int) -> list[str | list[str]]: ...
        def format_payload(self, entry_id: str, value: str | list[str]) -> dict: ...

Adding a new question type: implement BaseHandler, register in registry.py.
Never touch parser.py or engine.py when adding a new type.

---

## Celery worker rules

- One task: `run_job(job_id: str)` in worker/tasks.py.
- Update job.success_count / job.fail_count in DB after EVERY submission — not at the end.
  This is what makes progress polling work.
- Check job.status == "cancelled" at the start of each loop iteration. Break if true.
- Use a fresh DB session inside the task (not a FastAPI dependency — use async_sessionmaker directly).
- Log every submission result at DEBUG level, failures at WARNING.

---

## Working method

Before touching code on any task that affects more than one file:
1. Write a plan in plans/TASK_NAME.md (goal, files to change, ordered steps, edge cases)
2. Get it confirmed
3. Execute step by step — one file at a time
4. After completion: extract any new pitfalls into Known pitfalls below, delete the plan

---

## Known pitfalls

- FB_PUBLIC_LOAD_DATA_ structure: always null-check before accessing nested indices.
  Google occasionally adds wrapper layers. Parse defensively.
- httpx with form data + checkboxes: pass a list of tuples for repeated keys:
  `data=[("entry.123", "A"), ("entry.123", "B")]` — do NOT use a dict.
- SQLAlchemy async: never use `lazy` relationships inside async sessions.
  Use `selectinload()` or `joinedload()` explicitly in every query that needs relations.
- Alembic + asyncpg: alembic uses a sync connection for migrations even with an async app.
  Use a separate sync DATABASE_URL in alembic/env.py (replace +asyncpg with +psycopg2).
- Celery task and FastAPI share models but NOT the same DB session.
  The task must create its own session via async_sessionmaker.
- Next.js App Router: do not use `useEffect` for data fetching — use server components
  or React Query. Client components only when interactivity is needed.

---

## In scope (Phase 1)

- Email/password auth (signup, login)
- Form parsing: multiple choice, checkbox, dropdown
- Response distribution config UI
- Job creation + Celery queue + worker
- Job progress polling page
- Dashboard with history + re-run
- Landing page
- Input validation everywhere
- pytest tests for parser, distribution, engine

## Out of scope — do NOT build

- Stripe / payments
- Email sending (log it, do not send)
- Short text, linear scale, date, grid question types
- Admin panel
- External API access
- OAuth / social login
- Email notifications
