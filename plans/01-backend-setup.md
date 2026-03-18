# Plan: Backend Setup — Project Structure, Requirements, and DB Models

## Goal

Bootstrap the FastAPI backend: create the full directory skeleton, `requirements.txt`,
`.env.example`, and all SQLAlchemy ORM models with an Alembic migration environment.
No routes, services, or business logic yet — only the foundation everything else builds on.

---

## Files to create / change

| File | Action |
|------|--------|
| `backend/requirements.txt` | Create |
| `backend/.env.example` | Create |
| `backend/app/__init__.py` | Create (empty) |
| `backend/app/config.py` | Create |
| `backend/app/database.py` | Create |
| `backend/app/models/__init__.py` | Create (empty) |
| `backend/app/models/user.py` | Create |
| `backend/app/models/job.py` | Create |
| `backend/app/models/submission.py` | Create |
| `backend/app/main.py` | Create (minimal app stub) |
| `backend/app/auth/__init__.py` | Create (empty) |
| `backend/app/auth/users.py` | Create (FastAPI-Users wiring) |
| `backend/app/schemas/__init__.py` | Create (empty) |
| `backend/app/routers/__init__.py` | Create (empty) |
| `backend/app/services/__init__.py` | Create (empty) |
| `backend/app/worker/__init__.py` | Create (empty) |
| `backend/alembic.ini` | Create |
| `backend/alembic/env.py` | Create |
| `backend/alembic/versions/.gitkeep` | Create |
| `backend/tests/__init__.py` | Create (empty) |

---

## Ordered steps

### Step 1 — `requirements.txt`

Pin all direct dependencies with loose version constraints:

```
fastapi>=0.111
uvicorn[standard]>=0.29
pydantic-settings>=2.2
sqlalchemy[asyncio]>=2.0
asyncpg>=0.29            # async PostgreSQL driver
psycopg2-binary>=2.9     # sync driver for Alembic only
alembic>=1.13
fastapi-users[sqlalchemy]>=13.0
celery[redis]>=5.3
redis>=5.0
httpx>=0.27
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
pytest>=8.0
pytest-asyncio>=0.23
```

### Step 2 — `.env.example`

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/formflood_dev
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-this-to-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### Step 3 — `app/config.py`

`pydantic-settings` `Settings` class reading all five env vars above.
Expose a module-level `settings = Settings()` singleton.

### Step 4 — `app/database.py`

- Create async `engine` via `create_async_engine(settings.DATABASE_URL)`.
- Create `async_sessionmaker` as `AsyncSessionLocal`.
- Define `Base = DeclarativeBase()` — all models import from here.
- Define `get_async_session` FastAPI dependency (yields `AsyncSession`).
- Also expose `async_sessionmaker` for direct use in Celery tasks.

### Step 5 — `app/models/user.py`

Columns (all per PRD §5):
- `id`: `UUID`, PK, default `uuid4`
- `email`: `String`, unique, not null
- `hashed_password`: `String`, not null
- `is_active`: `Boolean`, default `True`
- `plan`: `String`, default `"free"`
- `created_at`: `DateTime(timezone=True)`, server_default `now()`

Inherit from both SQLAlchemy `Base` and FastAPI-Users `SQLAlchemyBaseUserTableUUID`
(the mixin provides `id`, `email`, `hashed_password`, `is_active`, `is_superuser`,
`is_verified` — add `plan` and `created_at` on top).

### Step 6 — `app/models/job.py`

Columns:
- `id`: `UUID`, PK, default `uuid4`
- `user_id`: `UUID`, FK `user.id`, not null, indexed
- `status`: `Enum("pending","running","completed","failed","cancelled")`, not null, default `"pending"`
- `form_url`: `Text`, not null
- `form_title`: `String(255)`, not null
- `total_count`: `Integer`, not null
- `success_count`: `Integer`, default `0`, not null
- `fail_count`: `Integer`, default `0`, not null
- `delay_ms`: `Integer`, default `1000`, not null
- `config`: `JSON`, not null  (full distribution config)
- `celery_task_id`: `String(255)`, nullable
- `created_at`: `DateTime(timezone=True)`, server_default `now()`
- `started_at`: `DateTime(timezone=True)`, nullable
- `completed_at`: `DateTime(timezone=True)`, nullable

Relationship: `user` (back-ref not needed for Phase 1).

### Step 7 — `app/models/submission.py`

Columns:
- `id`: `UUID`, PK, default `uuid4`
- `job_id`: `UUID`, FK `job.id`, not null, indexed
- `status`: `Enum("success","failed")`, not null
- `error_message`: `Text`, nullable
- `submitted_at`: `DateTime(timezone=True)`, server_default `now()`

### Step 8 — `app/auth/users.py`

Wire up FastAPI-Users:
- `UserDatabase` adapter over `User` model + async session
- `UserManager` with `SECRET_KEY` from `settings`
- `fastapi_users` instance with JWT backend
- Export: `fastapi_users`, `current_active_user` dependency, auth router includes

### Step 9 — `app/main.py`

Minimal FastAPI app:
- CORS middleware (allow all origins for local dev)
- Include FastAPI-Users auth routers (`/auth/register`, `/auth/jwt/login`, `/auth/jwt/logout`)
- Placeholder includes for `routers/forms` and `routers/jobs` (commented out — not created yet)
- Health-check `GET /healthz` returning `{"status": "ok"}`

### Step 10 — Alembic setup

- `alembic.ini` pointing `script_location = alembic`, `sqlalchemy.url` left as placeholder
  (overridden in `env.py` from `settings`)
- `alembic/env.py`:
  - Import `Base` from `app.database` and all models so autogenerate detects them
  - Use a **sync** `DATABASE_URL` (replace `+asyncpg` with `+psycopg2`) per known pitfall
  - `target_metadata = Base.metadata`

---

## Edge cases and pitfalls to watch

1. **FastAPI-Users mixin vs custom columns** — `SQLAlchemyBaseUserTableUUID` already declares
   `id`, `email`, `hashed_password`, `is_active`. Do not re-declare them; only add `plan`
   and `created_at`.

2. **Alembic sync driver** — `alembic/env.py` must swap `+asyncpg` → `+psycopg2` for the
   sync connection. Forgetting this causes `MissingGreenlet` errors at migration time.

3. **SQLAlchemy `Enum` type in Postgres** — use `native_enum=False` or name the enum
   explicitly to avoid conflicts across multiple tables sharing status-like enums.

4. **`UUID` default** — use `default=uuid4` (Python-side), not `server_default`, so IDs
   are known before DB round-trip and Celery can receive them immediately.

5. **`JSON` column and Celery** — `job.config` will be serialized/deserialized automatically
   by SQLAlchemy; no manual `json.dumps` needed when writing or reading.

6. **`async_sessionmaker` export** — both FastAPI (via dependency) and the Celery task need
   access to session creation. Export `AsyncSessionLocal` from `database.py` so the worker
   can import it directly without re-creating the engine.

---

## Out of scope for this task

- Routers (`forms.py`, `jobs.py`)
- Service layer (parser, submission engine, distribution)
- Celery task implementation
- Frontend
- Docker Compose

---

## Done criteria

- All listed files exist with correct content
- `python -c "from app.main import app"` succeeds (with env vars set)
- `alembic revision --autogenerate -m "initial_models"` produces a migration that
  creates `user`, `job`, and `submission` tables
