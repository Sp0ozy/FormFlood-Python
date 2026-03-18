# FormFlood — Product Requirements Document
# Python Stack (FastAPI + Celery + Redis + PostgreSQL + Next.js)

---

## 1. What this product is

FormFlood is a public SaaS web application that lets users bulk-generate and submit responses
to Google Forms at scale. The user pastes a Google Form URL, the app parses all questions and
their options, the user configures response distributions per question, sets a count and delay,
and the app submits everything in the background via a job queue while showing live progress.

---

## 2. Core user flow

1. User signs up / logs in
2. Pastes a Google Form URL
3. App parses the form and shows all questions with their options
4. User configures distribution per question (e.g. option A 60%, option B 40%)
5. User sets total submission count and delay between submissions (ms)
6. User clicks Submit — job is created and enqueued
7. User is redirected to job progress page (polls every 3s)
8. After completion, job appears in dashboard with stats
9. User can re-run any past job with one click

---

## 3. Tech stack

| Layer            | Technology                        | Notes                                          |
|------------------|-----------------------------------|------------------------------------------------|
| API              | FastAPI                           | Async, typed, auto-generates OpenAPI docs      |
| Job queue        | Celery + Redis                    | Async background submission workers            |
| Database         | PostgreSQL                        | Via SQLAlchemy 2.0 (async) + Alembic migrations|
| Auth             | FastAPI-Users                     | Email/password, JWT tokens                     |
| HTTP client      | httpx                             | Async HTTP for form fetching and submitting    |
| Frontend         | Next.js 14+ (App Router)          | React, TypeScript, Tailwind CSS                |
| Frontend→API     | REST (JSON)                       | JWT in Authorization header                    |
| Local dev        | Docker Compose                    | PostgreSQL + Redis + backend + worker + frontend|
| Deployment       | TBD — optimise for local dev first|                                                |

---

## 4. Project structure

formflood/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── config.py                # Settings via pydantic-settings (.env)
│   │   ├── database.py              # Async SQLAlchemy engine + session
│   │   ├── models/
│   │   │   ├── user.py              # User model
│   │   │   ├── job.py               # Job model
│   │   │   └── submission.py        # Individual submission record
│   │   ├── schemas/
│   │   │   ├── job.py               # Pydantic request/response schemas
│   │   │   └── form.py              # ParsedForm, ParsedQuestion schemas
│   │   ├── routers/
│   │   │   ├── forms.py             # POST /forms/parse
│   │   │   └── jobs.py              # CRUD for jobs
│   │   ├── services/
│   │   │   ├── form_parser/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── parser.py        # Fetch HTML, extract FB_PUBLIC_LOAD_DATA_, parse
│   │   │   │   ├── types.py         # ParsedForm, ParsedQuestion, QuestionType enum
│   │   │   │   └── handlers/        # Strategy pattern — one file per question type
│   │   │   │       ├── base.py      # Abstract base handler
│   │   │   │       ├── multiple_choice.py
│   │   │   │       ├── checkbox.py
│   │   │   │       ├── dropdown.py
│   │   │   │       └── registry.py  # Maps QuestionType -> handler instance
│   │   │   └── submission/
│   │   │       ├── engine.py        # Builds payload, POSTs to /formResponse
│   │   │       └── distribution.py  # Config + count -> shuffled response array
│   │   ├── worker/
│   │   │   ├── celery_app.py        # Celery instance + config
│   │   │   └── tasks.py             # run_job task: reads DB, submits, updates progress
│   │   └── auth/
│   │       └── users.py             # FastAPI-Users setup
│   ├── alembic/                     # DB migrations
│   ├── tests/                       # pytest tests for parser + engine + distribution
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (auth)/signup/
│   │   │   ├── (dashboard)/dashboard/
│   │   │   ├── (dashboard)/jobs/[id]/
│   │   │   ├── new/                 # Form URL input + config wizard
│   │   │   └── page.tsx             # Landing page
│   │   └── lib/
│   │       └── api.ts               # Typed fetch wrappers for all backend endpoints
│   ├── package.json
│   └── Dockerfile
├── plans/                           # Task plans (delete after completion)
├── docker-compose.yml
├── CLAUDE.md
└── PRD.md

---

## 5. Database models

### User
- id: UUID PK
- email: str unique
- hashed_password: str
- is_active: bool default True
- plan: str default "free"           # monetization hook, unused in v1
- created_at: datetime

### Job
- id: UUID PK
- user_id: UUID FK -> User
- status: enum [pending, running, completed, failed, cancelled]
- form_url: str
- form_title: str
- total_count: int
- success_count: int default 0
- fail_count: int default 0
- delay_ms: int default 1000         # delay between submissions
- config: JSON                       # full response distribution config
- celery_task_id: str nullable
- created_at: datetime
- started_at: datetime nullable
- completed_at: datetime nullable

### Submission
- id: UUID PK
- job_id: UUID FK -> Job
- status: enum [success, failed]
- error_message: str nullable
- submitted_at: datetime

---

## 6. API endpoints

| Method | Path                  | Auth | Description                              |
|--------|-----------------------|------|------------------------------------------|
| POST   | /auth/register        | No   | Create account                           |
| POST   | /auth/jwt/login       | No   | Login, returns JWT                       |
| POST   | /forms/parse          | Yes  | Fetch + parse a Google Form URL          |
| POST   | /jobs                 | Yes  | Create job + enqueue Celery task         |
| GET    | /jobs                 | Yes  | List all jobs for current user (paginated)|
| GET    | /jobs/{id}            | Yes  | Get job status + submission stats        |
| PATCH  | /jobs/{id}/cancel     | Yes  | Cancel a running job                     |

All error responses: {"detail": "message"} (FastAPI default) or {"error": str, "detail": any}

---

## 7. Google Form parsing — how it works

Every Google Form HTML page contains a JavaScript variable:
    FB_PUBLIC_LOAD_DATA_ = [...]

Steps to parse:
1. Fetch the form URL with httpx (add realistic User-Agent header)
2. Extract FB_PUBLIC_LOAD_DATA_ value from raw HTML via regex
3. json.loads() the extracted string
4. Navigate to data[1][1] — this is the list of question objects
5. Each question: [entry_id, title, _, question_type_int, options_data, ...]
6. Map question_type_int to QuestionType enum:
   - 2 = MULTIPLE_CHOICE
   - 4 = CHECKBOX
   - 3 = DROPDOWN

Submission endpoint:
    POST https://docs.google.com/forms/d/e/{FORM_ID}/formResponse
    Content-Type: application/x-www-form-urlencoded

Payload keys: entry.XXXXXXX (the entry_id for each question)
Checkboxes: append multiple values under the same key (use list in httpx data param)

---

## 8. Question handler interface (strategy pattern)

Every handler in services/form_parser/handlers/ implements:

class BaseHandler(ABC):
    def parse_options(self, raw_data: list) -> list[str]: ...
    def generate_responses(self, config: dict, count: int) -> list[str | list[str]]: ...
    def format_payload(self, entry_id: str, value: str | list[str]) -> dict: ...

Adding a new question type = implement this ABC + register in registry.py.
Do NOT touch parser.py or engine.py when adding a type.

---

## 9. Celery worker — job execution flow

1. Task receives job_id
2. Load job from DB, set status = running, started_at = now
3. Reconstruct response array: distribution.generate(job.config, job.total_count)
4. Shuffle the response array
5. For each response set:
   a. Build URL-encoded payload via engine.build_payload()
   b. POST to formResponse endpoint with httpx
   c. On success: increment success_count, insert Submission(status=success)
   d. On failure: increment fail_count, insert Submission(status=failed, error=...)
   e. Update job in DB after each submission (for live progress polling)
   f. Check if job.status == cancelled — if yes, break loop
   g. Sleep delay_ms / 1000 seconds
6. Set status = completed (or failed if all failed), completed_at = now

---

## 10. Frontend pages

### Landing page (/)
- If logged in: redirect to /dashboard
- If not: headline "Fill Google Forms at Scale", two CTAs (Sign up / Log in)
- 3 feature cards: Parse Any Form, Custom Distributions, Run in Background

### Auth pages (/login, /signup)
- Email + password forms
- JWT stored in httpOnly cookie or localStorage (decide during build)
- Forgot password: stub (show "coming soon" message)

### New job wizard (/new)
- Step 1: URL input + Parse button
- Step 2: Per-question distribution config (sliders or % inputs per option)
- Step 3: Count + delay settings + Submit button

### Job progress page (/jobs/[id])
- Polls GET /jobs/{id} every 3 seconds
- Shows: status badge, progress bar (success_count / total_count), fail count
- Cancel button (only when status = running)
- Auto-stops polling when status = completed | failed | cancelled

### Dashboard (/dashboard)
- Table of all jobs: form title, status, count, success/fail, created date
- Re-run button: creates new job with same config
- Pagination: 20 per page

---

## 11. Environment variables

# backend/.env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/formflood_dev
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-this-to-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000

---

## 12. Local dev setup (Docker Compose)

Services:
- db: postgres:16
- redis: redis:7-alpine
- backend: FastAPI on port 8000 (auto-reload)
- worker: Celery worker (same image as backend)
- frontend: Next.js on port 3000 (auto-reload)

---

## 13. Phase 1 scope — build this

- Email/password auth (signup, login)
- Form parsing (multiple choice, checkbox, dropdown only)
- Response distribution config UI
- Job creation + Celery queue
- Background worker with progress updates
- Job progress page with polling
- Dashboard with job history + re-run
- Landing page
- Input validation on all endpoints
- Tests for: parser, distribution, engine

## 14. Out of scope — do NOT build

- Stripe / payments
- Email sending (stub with print/logging)
- Short text, linear scale, date, time, grid question types
- Admin panel
- API access for external consumers
- Email notifications on job completion
- OAuth / social login
