from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.users import auth_backend, fastapi_users
from app.routers import forms, jobs
from app.schemas.user import UserCreate, UserRead

app = FastAPI(title="FormFlood API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth routes — provided by FastAPI-Users
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(forms.router)
app.include_router(jobs.router)
