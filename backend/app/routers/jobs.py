import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.auth.users import current_active_user
from app.database import AsyncSessionDep
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobCreate, JobListItem, JobRead
from app.worker.tasks import run_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobRead, status_code=201)
async def create_job(
    body: JobCreate,
    session: AsyncSessionDep,
    user: User = Depends(current_active_user),
) -> JobRead:
    """Create a new job and enqueue it in Celery."""
    job = Job(
        user_id=user.id,
        status="pending",
        form_url=body.form_url,
        form_title=body.form_title,
        total_count=body.total_count,
        delay_ms=body.delay_ms,
        config=body.config,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Enqueue the Celery task — returns immediately
    task = run_job.delay(str(job.id))
    job.celery_task_id = task.id
    await session.commit()
    await session.refresh(job)

    return JobRead.model_validate(job)


@router.get("", response_model=list[JobListItem])
async def list_jobs(
    session: AsyncSessionDep,
    user: User = Depends(current_active_user),
    limit: int = 20,
    offset: int = 0,
) -> list[JobListItem]:
    """List all jobs for the current user, newest first."""
    result = await session.execute(
        select(Job)
        .where(Job.user_id == user.id)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = result.scalars().all()
    return [JobListItem.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: uuid.UUID,
    session: AsyncSessionDep,
    user: User = Depends(current_active_user),
) -> JobRead:
    """Get a single job by ID. Used for progress polling."""
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobRead.model_validate(job)


@router.patch("/{job_id}/cancel", response_model=JobRead)
async def cancel_job(
    job_id: uuid.UUID,
    session: AsyncSessionDep,
    user: User = Depends(current_active_user),
) -> JobRead:
    """Cancel a running job. The worker checks this flag each iteration."""
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("pending", "running"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel a job with status '{job.status}'")

    job.status = "cancelled"
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)
