import logging
from celery import shared_task
from applications.ai.service import process_applicant_ai_match

from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=2, default_retry_delay=5, soft_time_limit=120, time_limit=180)
def score_applicant_resume_task(self, applicant_id: int):
    """
    Celery background task that invokes the AI Orchestrator Service
    asynchronously to score candidate resumes against job descriptions.
    """
    try:
        logger.info(f"[AI Task] Triggered background AI scoring for Applicant ID={applicant_id}")
        score = process_applicant_ai_match(applicant_id)
        return score
    except SoftTimeLimitExceeded as exc:
        logger.error(f"[AI Task] SoftTimeLimitExceeded for Applicant ID={applicant_id}: {exc}")
        return None
    except Exception as exc:
        logger.exception(f"[AI Task] Exception in AI scoring background task for Applicant ID={applicant_id}: {exc}")
        return None
