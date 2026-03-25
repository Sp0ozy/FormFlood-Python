import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.job import Job
from app.models.submission import Submission
from app.services.submission.distribution import generate_responses
from app.services.submission.engine import submit_form
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from sync Celery task context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, name="run_job")
def run_job(self, job_id: str) -> dict:
    """
    Main background task. Submits all form responses for a job.
    Runs synchronously (Celery default) but calls async DB + HTTP internally.
    """
    return _run_async(_run_job_async(job_id))

async def _run_job_async(job_id: str) -> dict:
    """Async implementation of the job runner."""
    async with AsyncSessionLocal() as session:
        # Load the job
        result = await session.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
        job = result.scalar_one_or_none()

        if not job:
            logger.error("Job %s not found", job_id)
            return {"status": "error", "reason": "job_not_found"}

        # Mark as running
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        await session.commit()

    # Generate the full response list from config
    payloads = generate_responses(job.config, job.total_count)
    logger.info("Job %s: starting %d submissions", job_id, len(payloads))

    for i, payload in enumerate(payloads):
        # Check for cancellation before each submission
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
            job = result.scalar_one()

            if job.status == "cancelled":
                logger.info("Job %s cancelled at submission %d", job_id, i)
                return {"status": "cancelled", "completed": i}

            # Submit the form
            success, error = await submit_form(job.config.get("form_id", ""), payload)

            if success:
                job.success_count += 1
                logger.debug("Job %s: submission %d succeeded", job_id, i)
            else:
                job.fail_count += 1
                logger.warning("Job %s: submission %d failed: %s", job_id, i, error)

            # Insert individual submission record
            submission = Submission(
                job_id=job.id,
                status="success" if success else "failed",
                error_message=error,
            )
            session.add(submission)
            await session.commit()

        # Respect the delay between submissions
        if job.delay_ms > 0 and i < len(payloads) - 1:
            await asyncio.sleep(job.delay_ms / 1000)

    # Mark job as completed
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
        job = result.scalar_one()
        job.status = "completed" if job.success_count > 0 else "failed"
        job.completed_at = datetime.now(timezone.utc)
        await session.commit()

    logger.info("Job %s done: %d success, %d failed", job_id, job.success_count, job.fail_count)
    return {"status": job.status, "success": job.success_count, "failed": job.fail_count}
