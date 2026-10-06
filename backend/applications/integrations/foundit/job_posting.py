"""
Foundit Job Posting Service (Phase 3B).
Manages single job publishing using JobBoardPosting (job_board="Foundit", external_job_id=folderId).
Includes idempotency checks, data validation, folderId verification, and safe error/timeout handling.
"""
import logging
from django.utils import timezone
from applications.models import JobBoardPosting
from applications.integrations.foundit.client import (
    FounditClient,
    FounditContractUnverifiedException,
    FounditAPIError,
    FounditTimeoutError,
    FounditValidationError,
)
from applications.integrations.foundit.auth import FounditAuthException
from applications.integrations.foundit.mappers import FounditJobMapper
from applications.integrations.foundit.constants import FOUNDIT_JOB_BOARD_NAME

logger = logging.getLogger(__name__)

class FounditJobPostingService:
    @staticmethod
    def get_or_create_posting(job_application):
        posting, _ = JobBoardPosting.objects.get_or_create(
            job=job_application,
            job_board=FOUNDIT_JOB_BOARD_NAME
        )
        return posting

    @staticmethod
    def validate_job_application(job_application):
        """
        Validates minimum required ATS Application job metadata before calling Foundit API.
        """
        if not job_application.position or not job_application.position.strip():
            raise FounditValidationError("Validation Error: Missing required ATS job field 'position'.")
        if not job_application.city or not job_application.city.strip():
            raise FounditValidationError("Validation Error: Missing required ATS job field 'city'.")
        if not job_application.state or not job_application.state.strip():
            raise FounditValidationError("Validation Error: Missing required ATS job field 'state'.")

    @classmethod
    def publish_job(cls, job_application, client=None):
        """
        Publishes a single selected ATS job Application to Foundit via official Job Posting API.
        Enforces idempotency, data validation, folderId verification, and safe error/timeout handling.
        """
        posting = cls.get_or_create_posting(job_application)

        # Idempotency check (Requirement 8)
        if posting.external_job_id and posting.status == 'PUBLISHED':
            logger.info(f"[FounditJobPostingService] Job {job_application.id} is already published on Foundit (folderId={posting.external_job_id}). Skipping.")
            return posting

        # Step 6: Validate mandatory job data before calling Foundit
        try:
            cls.validate_job_application(job_application)
        except FounditValidationError as ve:
            posting.status = 'FAILED'
            posting.error_message = str(ve)
            posting.save()
            logger.error(f"[FounditJobPostingService] Data validation failed for job {job_application.id}: {ve}")
            return posting

        # Set status to PENDING before posting
        posting.status = 'PENDING'
        posting.save()

        if client is None:
            client = FounditClient()

        existing_folder_id = posting.external_job_id or 0
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_application, existing_folder_id=existing_folder_id)

        try:
            response = client.post_job(payload)
            folder_id = str(response.get("folderId") or "")

            if folder_id and folder_id != "0":
                posting.external_job_id = folder_id
                posting.status = 'PUBLISHED'
                posting.published_at = timezone.now()
                posting.last_synced_at = timezone.now()
                posting.error_message = ""
                posting.save()
                logger.info(f"[FounditJobPostingService] Job {job_application.id} successfully published to Foundit (folderId={folder_id}).")
            else:
                posting.status = 'FAILED'
                posting.error_message = "Foundit API response did not contain a valid folderId."
                posting.save()
                logger.error(f"[FounditJobPostingService] Response for job {job_application.id} missing valid folderId.")
            return posting

        except FounditTimeoutError as te:
            posting.status = 'PENDING'
            posting.error_message = "Request timed out. Reconciliation required before retry."
            posting.last_synced_at = timezone.now()
            posting.save()
            logger.error(f"[FounditJobPostingService] Foundit API timed out for job {job_application.id}: {te}")
            return posting

        except (FounditAPIError, FounditAuthException) as e:
            posting.status = 'FAILED'
            posting.error_message = str(e)
            posting.last_synced_at = timezone.now()
            posting.save()
            logger.error(f"[FounditJobPostingService] Foundit API error publishing job {job_application.id}: {e}")
            return posting

        except FounditContractUnverifiedException as e:
            posting.status = 'PENDING'
            posting.error_message = str(e)
            posting.last_synced_at = timezone.now()
            posting.save()
            logger.info(f"[FounditJobPostingService] Job {job_application.id} marked PENDING due to Safety Guard.")
            return posting

        except Exception as e:
            posting.status = 'FAILED'
            posting.error_message = f"Unexpected error: {e.__class__.__name__}"
            posting.last_synced_at = timezone.now()
            posting.save()
            logger.error(f"[FounditJobPostingService] Unexpected exception publishing job {job_application.id}: {e}")
            return posting

    @classmethod
    def close_job(cls, job_application):
        """
        BLOCKED in Phase 3B.
        """
        try:
            posting = JobBoardPosting.objects.get(
                job=job_application,
                job_board=FOUNDIT_JOB_BOARD_NAME
            )
        except JobBoardPosting.DoesNotExist:
            return None

        client = FounditClient()
        try:
            if posting.external_job_id:
                client.expire_job(posting.external_job_id)
            posting.status = 'EXPIRED'
            posting.last_synced_at = timezone.now()
            posting.save()
            return posting
        except Exception as e:
            logger.error(f"[FounditJobPostingService] Error closing job {job_application.id}: {e}")
            posting.error_message = str(e)
            posting.save()
            return posting

