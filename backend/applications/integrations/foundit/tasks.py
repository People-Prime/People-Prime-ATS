"""
Isolated Celery Tasks for Foundit Integration.
Ensures that any Foundit failure or retry logic is contained strictly within Foundit tasks,
leaving core ATS, LinkedIn, and AI tasks completely unaffected.
"""
import logging
from celery import shared_task
from applications.models import Application
from applications.integrations.foundit.job_posting import FounditJobPostingService
from applications.integrations.foundit.candidate_ingestion import FounditCandidateIngestionService
from applications.integrations.foundit.constants import (
    is_foundit_webhook_processing_enabled,
)

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def publish_job_to_foundit_task(self, job_id):
    """
    Celery task to publish an ATS job to Foundit asynchronously.
    """
    try:
        job = Application.objects.get(id=job_id, candidate_name='')
        FounditJobPostingService.publish_job(job)
    except Application.DoesNotExist:
        logger.error(f"[publish_job_to_foundit_task] Job application ID {job_id} not found.")
    except Exception as exc:
        logger.error(f"[publish_job_to_foundit_task] Failure for job ID {job_id}: {exc}")
        try:
            self.retry(exc=exc)
        except Exception:
            pass

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def sync_foundit_applications_task(self, folder_id, applications_since=None):
    """
    Celery task to poll official Foundit Application GET API for a folder_id with pagination.
    """
    try:
        from applications.integrations.foundit.candidate_ingestion import FounditApplicationSyncService
        return FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=folder_id,
            applications_since=applications_since
        )
    except Exception as exc:
        logger.error(f"[sync_foundit_applications_task] Failure for folder_id {folder_id}: {exc}")
        try:
            self.retry(exc=exc)
        except Exception:
            pass

@shared_task(bind=True, max_retries=1, default_retry_delay=120)
def sync_all_foundit_jobs_task(self):
    """
    Celery task to scan all active/published Foundit jobs and synchronize applications.
    """
    try:
        from applications.integrations.foundit.candidate_ingestion import FounditApplicationSyncService
        return FounditApplicationSyncService.sync_all_published_jobs()
    except Exception as exc:
        logger.error(f"[sync_all_foundit_jobs_task] Failure: {exc}")
        try:
            self.retry(exc=exc)
        except Exception:
            pass

@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def process_foundit_webhook_task(self, payload):
    """
    Process an incoming Foundit application-created webhook event.

    Processing remains disabled unless explicitly enabled in the environment.
    """
    if not is_foundit_webhook_processing_enabled():
        logger.warning(
            "[process_foundit_webhook_task] Ignoring webhook: "
            "FOUNDIT_WEBHOOK_PROCESSING_ENABLED is false."
        )
        return {"status": "disabled"}

    if not isinstance(payload, dict):
        logger.warning(
            "[process_foundit_webhook_task] Ignoring invalid payload type."
        )
        return {"status": "invalid_payload"}

    try:
        folder_id = payload.get("folder_id") or payload.get("folderId")
        if folder_id:
            sync_foundit_applications_task.delay(folder_id)
            return {"status": "sync_queued"}

        FounditCandidateIngestionService.ingest_candidate(payload)
        return {"status": "processed"}

    except Exception as exc:
        logger.error(
            "[process_foundit_webhook_task] Failure processing payload: %s",
            exc,
        )
        raise
