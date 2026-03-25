import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JobCreate(BaseModel):
    form_url: str
    form_title: str
    total_count: int
    delay_ms: int = 1000
    config: dict


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    form_url: str
    form_title: str
    total_count: int
    success_count: int
    fail_count: int
    delay_ms: int
    config: dict
    celery_task_id: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class JobListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    form_url: str
    form_title: str
    total_count: int
    success_count: int
    fail_count: int
    created_at: datetime
