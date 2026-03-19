# FormFlood — CLAUDE.md

## What this project is

FormFlood is a SaaS tool for bulk-submitting Google Forms.
Full description, architectural decisions, and build order are in PRD.md. Read it first.

---

## Stack

| Layer    | Technology                                  |
|----------|---------------------------------------------|
| API      | FastAPI (async)                             |
| Queue    | Celery + Redis                              |
| DB       | PostgreSQL — SQLAlchemy 2.0 async + Alembic |
| Auth     | FastAPI-Users (JWT, email/password)         |
| HTTP     | httpx (async)                               |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind |
| Dev      | Docker Compose                              |

---

## Code rules

### Python
- Python 3.11+. Type hints on every function — arguments and return type.
- `async`/`await` everywhere. No sync DB calls inside async routes.
- SQLAlchemy 2.0 only: `select()`, `session.execute()`, `await session.commit()`.
- Pydantic v2: `model_config = ConfigDict(from_attributes=True)`.
- All config via `app/config.py` (pydantic-settings). No hardcoded strings or URLs.
- Errors: `raise HTTPException(status_code=X, detail="message")`.
- One Celery app instance in `worker/celery_app.py`. Import from there everywhere.
- DB session via FastAPI dependency only: `Depends(get_async_session)`.
- No `print()` — use Python `logging` module.
- No bare `except:` — always catch a specific exception type.

### TypeScript
- Strict mode. No `any`.
- All API calls go through `src/lib/api.ts` — never call `fetch()` directly in components.
- Loading and error states required for every async operation.

### General
- Never commit `.env` files.
- Every migration gets a descriptive name: `alembic revision --autogenerate -m "add_job_cancel_status"`.

---

## How Google Forms submission works

Parse target: `FB_PUBLIC_LOAD_DATA_` JavaScript variable in the form HTML.

Steps:
1. `httpx.get(form_url)` with a realistic User-Agent header
2. Regex — extract JSON from `FB_PUBLIC_LOAD_DATA_`
3. `json.loads()` — parse it
4. Questions live at `data[1][1]`
5. Each question: `[entry_id, title, _, type_int, options, ...]`
6. `type_int`: 2=MULTIPLE_CHOICE, 3=DROPDOWN, 4=CHECKBOX

Submission:
- POST `https://docs.google.com/forms/d/e/{FORM_ID}/formResponse`
- `Content-Type: application/x-www-form-urlencoded`
- Keys: `entry.XXXXXXX` per question
- Checkboxes: list of tuples under the same key (httpx handles this automatically)

---

## Celery worker rules

- One task: `run_job(job_id: str)` in `worker/tasks.py`.
- Update `job.success_count` / `job.fail_count` after EVERY submission — not at the end.
- Check `job.status == "cancelled"` at the start of each loop iteration. Break if true.
- Use a fresh DB session inside the task via `async_sessionmaker` (not a FastAPI dependency).
- Log every submission result at DEBUG level, failures at WARNING.

---

## Working method

Before touching code on any task that affects more than one file:
1. Write a plan in `plans/TASK_NAME.md` (goal, files to change, ordered steps, edge cases)
2. Execute step by step — one file at a time
3. After completion: delete the plan

---

## Known pitfalls

- `FB_PUBLIC_LOAD_DATA_` structure: always null-check before accessing nested indices.
- httpx + checkboxes: `data=[("entry.123", "A"), ("entry.123", "B")]` — NOT a dict.
- SQLAlchemy async: never use lazy relationships inside async sessions.
  Use `selectinload()` or `joinedload()` explicitly in every query that needs relations.
- Alembic + asyncpg: replace `+asyncpg` with `+psycopg2` in `alembic/env.py`.
- Celery task creates its own DB session — does not share with FastAPI.
- Next.js App Router: don't use `useEffect` for data fetching — use server components or React Query.
