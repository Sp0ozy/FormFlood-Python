# FormFlood — Product Requirements Document

## What this is

FormFlood is a SaaS tool for bulk-submitting responses to Google Forms.
The user pastes a form URL, configures answers, clicks Submit —
the app sends hundreds of forms in the background while they do something else.

---

## Key architectural decisions and WHY

### 1. Background task queue (Celery + Redis)

**Problem:** sending 1000 forms = 1000 HTTP requests with delays.
You can't keep the browser open, and you can't hold a single HTTP request open for 10+ minutes.

**Solution:** when the user hits Submit, the API creates a Job in the database
and puts a task in the queue. A Celery worker picks it up and runs it
independently of the browser.

**Redis** is the broker: it holds the queue between the API and the worker.
API puts task in → Redis holds it → worker picks it up.

**Flow:**
```
Browser → POST /jobs → FastAPI creates Job in DB → puts task_id in Redis
                                                        ↓
                                              Celery worker picks it up
                                              and submits forms
```

---

### 2. Progress stored in DB after every submission

**Problem:** if the worker crashes on submission #347 out of 1000 — where do we resume?

**Solution:** after each submission the worker writes to Job:
`success_count += 1` or `fail_count += 1`. These are atomic updates in Postgres.

On restart, the worker reads `success_count` from DB and resumes from position
`success_count + fail_count`. The client sees live progress via polling every 3 seconds.

---

### 3. JWT authentication

**Problem:** each user should only see their own jobs.

**Solution:** on registration a User is created. On login a JWT token is issued
(a signed string with user_id inside). Every API request sends this token
in the `Authorization: Bearer <token>` header. The API decodes it and knows who is asking.

**JWT is stateless** — the server never stores it, only verifies the signature with SECRET_KEY.

---

## Database: three tables

### User
Who uses the app.
```
id           UUID   — unique identifier
email        str    — login
password     str    — hashed (bcrypt, never plain text)
plan         str    — "free" (monetization hook, unused in v1)
created_at   datetime
```

### Job
One "job" = one bulk submission run.
```
id               UUID
user_id          UUID → FK to User  (whose job)
status           enum: pending | running | completed | failed | cancelled
form_url         str   — URL of the form
form_title       str   — title (parsed from the form)
total_count      int   — how many to submit
success_count    int   — how many succeeded (updated in real time)
fail_count       int   — how many failed
delay_ms         int   — pause between submissions (protection against bans)
config           JSON  — response distribution per question
celery_task_id   str   — Celery task ID (needed for cancellation)
created_at       datetime
started_at       datetime nullable
completed_at     datetime nullable
```

**Why `config` as JSON?** The answer structure depends on the form — each form has
different questions and options. Storing this in separate tables is complex;
JSON is more flexible for this dynamic structure.

### Submission
One row = one submitted form.
```
id             UUID
job_id         UUID → FK to Job
status         enum: success | failed
error_message  str nullable — what went wrong
submitted_at   datetime
```

**Why Submission if Job already has counters?**
Counters give aggregated stats (fast).
Submission lets you inspect details — exactly when a specific submission failed,
what error. Needed for debugging and detail views.

---

## API endpoints

| Method | Path                  | Auth | Description                              |
|--------|-----------------------|------|------------------------------------------|
| POST   | /auth/register        | No   | Create account                           |
| POST   | /auth/login           | No   | Get JWT token                            |
| POST   | /forms/parse          | Yes  | Parse a Google Form by URL               |
| POST   | /jobs                 | Yes  | Create job and enqueue                   |
| GET    | /jobs                 | Yes  | List current user's jobs                 |
| GET    | /jobs/{id}            | Yes  | Status + progress of one job             |
| PATCH  | /jobs/{id}/cancel     | Yes  | Cancel a running job                     |

---

## How Google Forms parsing works

Google Forms embeds all form data directly in the page HTML in a variable:
```js
FB_PUBLIC_LOAD_DATA_ = [[...huge array...]]
```

Algorithm:
1. `httpx.get(url)` — download the form HTML
2. `regex` — extract JSON from `FB_PUBLIC_LOAD_DATA_`
3. `json.loads()` — parse it
4. `data[1][1]` — list of questions
5. Each question: `[entry_id, title, _, type_int, options]`
   - `type_int == 2` → multiple choice
   - `type_int == 3` → dropdown
   - `type_int == 4` → checkbox

Submission — plain POST:
```
POST https://docs.google.com/forms/d/e/{FORM_ID}/formResponse
Content-Type: application/x-www-form-urlencoded
Body: entry.123456=AnswerA&entry.789012=AnswerB
```

---

## Stack

| Layer      | Technology                          | Why this choice                  |
|------------|-------------------------------------|----------------------------------|
| API        | FastAPI (async Python)              | Fast, typed, async-native        |
| Queue      | Celery + Redis                      | Industry standard for bg tasks   |
| DB         | PostgreSQL + SQLAlchemy 2.0 async   | Reliable relational DB           |
| Migrations | Alembic                             | DB schema versioning             |
| Auth       | FastAPI-Users + JWT                 | Ready solution, not reinvented   |
| HTTP       | httpx (async)                       | Async HTTP client                |
| Frontend   | Next.js 14 + TypeScript + Tailwind  | App Router, server components    |
| Dev env    | Docker Compose                      | Postgres + Redis locally         |

---

## Project structure

```
formflood/
├── backend/
│   ├── app/
│   │   ├── main.py          — FastAPI entry point, router registration
│   │   ├── config.py        — all settings from .env via pydantic-settings
│   │   ├── database.py      — async SQLAlchemy engine, session dependency
│   │   ├── models/          — ORM models (User, Job, Submission)
│   │   ├── schemas/         — Pydantic request/response schemas
│   │   ├── routers/         — HTTP routes (forms.py, jobs.py)
│   │   ├── services/
│   │   │   ├── form_parser/ — Google Forms parsing (parser + handlers)
│   │   │   └── submission/  — form submission (engine + distribution)
│   │   ├── worker/
│   │   │   ├── celery_app.py — Celery initialization
│   │   │   └── tasks.py      — run_job task
│   │   └── auth/
│   │       └── users.py     — FastAPI-Users config
│   ├── alembic/             — DB migrations
│   ├── tests/               — pytest tests
│   └── requirements.txt
├── frontend/
│   └── src/app/             — Next.js pages
├── docker-compose.yml       — Postgres + Redis + backend + worker + frontend
├── PRD.md                   — this file
└── CLAUDE.md                — rules for Claude Code
```

---

## Build order (step by step)

1. `config.py` — settings (foundation, everything depends on this)
2. `database.py` — DB connection
3. `models/` — table structure
4. `alembic/` — first migration, create tables
5. `auth/` — authentication
6. `schemas/` — Pydantic schemas
7. `routers/` — HTTP routes (empty stubs first)
8. `services/form_parser/` — form parsing
9. `services/submission/` — form submission
10. `worker/` — Celery task
11. `routers/` — wire in real logic
12. `frontend/` — pages

---

## Phase 1 scope

**Building:**
- Email/password auth
- Form parsing: multiple choice, checkbox, dropdown
- Response distribution config
- Job creation + Celery queue
- Worker with progress tracking
- Progress page with polling
- Dashboard with history + re-run
- Landing page
- Tests: parser, distribution, engine

**NOT building:**
- Stripe / payments
- Email notifications
- Short text, linear scale, date, grid question types
- Admin panel
- External API
