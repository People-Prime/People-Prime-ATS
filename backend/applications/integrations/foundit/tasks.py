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
    Celery task to process incoming Foundit webhook event job.application.response.created.
    """
    try:
        folder_id = payload.get("folder_id") or payload.get("folderId")
        if folder_id:
            sync_foundit_applications_task.delay(folder_id)
        else:
            FounditCandidateIngestionService.ingest_candidate(payload)
    except Exception as exc:
        logger.error(f"[process_foundit_webhook_task] Failure processing payload: {exc}")
