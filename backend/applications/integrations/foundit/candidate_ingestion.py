"""
Foundit Candidate Ingestion Service.
Processes candidate application data retrieved from Foundit, performs folder_id lookup,
enforces duplicate protection, streams resume binaries to AWS S3, creates CareerPortalApplicant (source="Foundit"),
and dispatches existing Nemotron AI resume scoring tasks.
"""
import datetime
import logging
from django.utils import timezone
from applications.models import Application, CareerPortalApplicant, JobBoardPosting
from applications.integrations.foundit.mappers import FounditCandidateMapper
from applications.integrations.foundit.constants import FOUNDIT_JOB_BOARD_NAME

logger = logging.getLogger(__name__)

class FounditCandidateIngestionService:
    @classmethod
    def ingest_candidate(cls, application_dict):
        """
        Ingests a single application dict retrieved from Foundit.
        """
        if not isinstance(application_dict, dict):
            logger.error("[FounditIngestion] Invalid application payload: expected dictionary.")
            return {
                "success": False,
                "error": "Application payload must be a dictionary.",
                "code": "MALFORMED_CANDIDATE_PAYLOAD"
            }

        # 1. Resolve ATS Job via folder_id
        folder_id = str(application_dict.get("folder_id") or application_dict.get("folderId") or "").strip()

        target_job = None
        if folder_id:
            posting = JobBoardPosting.objects.filter(
                job_board=FOUNDIT_JOB_BOARD_NAME,
                external_job_id=folder_id
            ).first()
            if posting:
                target_job = posting.job

        # Fallback to vendorJobId if passed in testing payload
        if not target_job:
            vendor_job_id = application_dict.get("vendor_job_id") or application_dict.get("vendorJobId")
            if vendor_job_id:
                clean_id_str = str(vendor_job_id).replace("PPW-", "").strip()
                if clean_id_str.isdigit():
                    target_job = Application.objects.filter(id=int(clean_id_str), candidate_name='').first()

        # Strict Unmatched Job Guard: Do NOT guess by title, do NOT create dummy jobs!
        if not target_job:
            logger.error(f"[FounditIngestion] Unmatched folder_id in payload: folder_id={folder_id}")
            return {
                "success": False,
                "error": f"Unmatched Foundit folder_id: {folder_id}",
                "code": "UNMATCHED_FOLDER_ID"
            }

        # 2. Duplicate Protection (Idempotency Check)
        foundit_app_id = str(application_dict.get("application_id") or application_dict.get("applicationId") or "").strip()
        if foundit_app_id:
            existing = CareerPortalApplicant.objects.filter(
                foundit_application_id=foundit_app_id,
                source=FOUNDIT_JOB_BOARD_NAME
            ).first()
            if existing:
                logger.info(f"[FounditIngestion] Duplicate candidate application ignored for foundit_application_id={foundit_app_id}")
                return {
                    "success": True,
                    "duplicate": True,
                    "message": "Application already processed.",
                    "applicant_id": existing.id
                }

        # 3. Stream Resume Binary to AWS S3 (ats-resumestorage)
        resume_download_url = application_dict.get("resume_file_download_url") or application_dict.get("resumeUrl") or ""
        s3_resume_link = resume_download_url

        if resume_download_url and isinstance(resume_download_url, str) and resume_download_url.startswith(("http://", "https://")):
            try:
                import os
                import requests
                import boto3
                from botocore.config import Config

                bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage')
                region = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
                access_key = os.getenv('AWS_ACCESS_KEY_ID')
                secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')

                if access_key and secret_key:
                    with requests.get(resume_download_url, stream=True, timeout=(5, 15)) as res:
                        if res.status_code == 200:
                            filename = f"foundit_{foundit_app_id or target_job.id}.pdf"
                            s3_config = Config(connect_timeout=5, read_timeout=15, retries={'max_attempts': 2})
                            s3_client = boto3.client(
                                's3',
                                region_name=region,
                                aws_access_key_id=access_key,
                                aws_secret_access_key=secret_key,
                                config=s3_config
                            )
                            s3_client.upload_fileobj(
                                res.raw,
                                bucket_name,
                                filename,
                                ExtraArgs={'ContentType': 'application/pdf'}
                            )
                            s3_resume_link = f"s3://{bucket_name}/{filename}"
                        else:
                            logger.warning(f"[FounditIngestion] Resume download HTTP {res.status_code}, falling back to URL.")
                            s3_resume_link = resume_download_url
            except Exception as e:
                logger.warning(f"[FounditIngestion] S3 streaming fallback to URL. Error: {e.__class__.__name__}")
                s3_resume_link = resume_download_url

        # 4. Map & Create CareerPortalApplicant with source = "Foundit"
        try:
            applicant_data = FounditCandidateMapper.map_foundit_application_to_applicant(application_dict, target_job)
        except Exception as e:
            logger.error(f"[FounditIngestion] Malformed candidate payload mapping failed: {e}")
            return {
                "success": False,
                "error": f"Malformed candidate payload: {str(e)}",
                "code": "MALFORMED_CANDIDATE_PAYLOAD"
            }

        if s3_resume_link:
            applicant_data["resume"] = s3_resume_link

        from django.db import IntegrityError, transaction
        applicant = None
        try:
            with transaction.atomic():
                applicant = CareerPortalApplicant.objects.create(**applicant_data)
        except IntegrityError as ie:
            # Query for existing Foundit applicant only after the inner savepoint has rolled back
            existing = None
            if foundit_app_id:
                existing = CareerPortalApplicant.objects.filter(
                    foundit_application_id=foundit_app_id,
                    source=FOUNDIT_JOB_BOARD_NAME
                ).first()
            if existing:
                logger.info(
                    f"[FounditIngestion] Concurrent duplicate caught by database constraint for "
                    f"foundit_application_id={foundit_app_id}. Preserving existing applicant ID={existing.id}."
                )
                return {
                    "success": True,
                    "duplicate": True,
                    "message": "Application already processed (concurrent duplicate caught).",
                    "applicant_id": existing.id
                }

            # Handle the case where conflict occurred but no matching applicant could be found
            logger.error(
                f"[FounditIngestion] IntegrityError occurred during applicant creation, but existing applicant "
                f"could not be resolved for foundit_application_id={foundit_app_id}: {ie}"
            )
            return {
                "success": False,
                "error": f"Database integrity conflict occurred: {ie}",
                "code": "DB_INTEGRITY_CONFLICT"
            }

        logger.info(f"[FounditIngestion] Created CareerPortalApplicant ID={applicant.id} (source='Foundit') for job ID={target_job.id}")

        # 5. Trigger Existing Nemotron AI Resume Scoring Task
        try:
            from applications.ai.tasks import score_applicant_resume_task
            score_applicant_resume_task.delay(applicant.id)
        except Exception as e:
            logger.error(f"[FounditIngestion] Error triggering score_applicant_resume_task for applicant {applicant.id}: {e}")

        return {
            "success": True,
            "duplicate": False,
            "message": "Candidate application ingested successfully.",
            "applicant_id": applicant.id
        }


class FounditApplicationSyncService:
    """
    Service to poll Foundit Applications API with defensive pagination,
    job mapping, duplicate prevention, and aggregate reporting.
    """
    MAX_PAGES_SAFETY_LIMIT = 50
    DEFAULT_PAGE_SIZE = 100
    OVERLAP_WINDOW_MINUTES = 2
    MAX_CONSECUTIVE_FOLDER_ERRORS = 3

    @classmethod
    def format_applications_since(cls, dt_or_str):
        """
        Explicitly converts datetime to UTC before formatting to ISO 8601 '%Y-%m-%dT%H:%M:%SZ'.
        Preserves string values after stripping whitespace.
        """
        if not dt_or_str:
            return None
        if isinstance(dt_or_str, (datetime.datetime, datetime.date)):
            if isinstance(dt_or_str, datetime.date) and not isinstance(dt_or_str, datetime.datetime):
                dt = datetime.datetime.combine(dt_or_str, datetime.time.min, tzinfo=datetime.timezone.utc)
            elif timezone.is_naive(dt_or_str):
                dt = timezone.make_aware(dt_or_str, datetime.timezone.utc)
            else:
                dt = dt_or_str.astimezone(datetime.timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        elif isinstance(dt_or_str, str):
            return dt_or_str.strip()
        return None

    @classmethod
    def _release_lock(cls, lock_key, lock_token):
        """
        Safely releases the lock only if the stored token matches lock_token.
        Prevents a worker whose lock expired from deleting another worker's lock.
        Uses Lua script for atomic check-and-delete on Redis if available,
        with a safe check-and-delete fallback for LocMemCache / other cache backends.
        """
        from django.core.cache import cache
        try:
            raw_client = None
            serializer = None
            if hasattr(cache, '_cache'):
                backend = cache._cache
                if hasattr(backend, 'get_client'):
                    try:
                        raw_client = backend.get_client()
                        serializer = getattr(backend, '_serializer', None)
                    except Exception:
                        pass

            if raw_client and hasattr(raw_client, 'eval'):
                lua_release = """
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
                """
                redis_key = cache.make_key(lock_key) if hasattr(cache, 'make_key') else lock_key
                expected_val = serializer.dumps(lock_token) if (serializer and hasattr(serializer, 'dumps')) else lock_token
                res = raw_client.eval(lua_release, 1, redis_key, expected_val)
                return bool(res)
        except Exception as e:
            logger.warning(f"[FounditSync] Redis Lua lock release fallback due to: {e}")

        # Fallback (LocMemCache or non-redis cache in tests)
        current = cache.get(lock_key)
        if current == lock_token:
            cache.delete(lock_key)
            return True
        return False

    @classmethod
    def sync_applications_for_folder(
        cls,
        folder_id,
        client=None,
        max_pages=MAX_PAGES_SAFETY_LIMIT,
        limit=DEFAULT_PAGE_SIZE,
        applications_since=None
    ):
        """
        Polls Foundit Applications API for a specific folder_id with defensive pagination.
        Stops when:
        1. total_fetched >= total_job_applications
        2. returned applications list is empty or partial
        3. max_pages safety limit is reached
        """
        from django.core.cache import cache

        if client is None:
            from applications.integrations.foundit.client import FounditClient
            client = FounditClient()

        clean_folder_id = str(folder_id).strip()
        summary = {
            "folder_id": clean_folder_id,
            "total_job_applications": 0,
            "total_fetched": 0,
            "pages_fetched": 0,
            "new_ingested": 0,
            "duplicates_skipped": 0,
            "unmatched_errors": 0,
            "failed_errors": 0,
            "quarantined": False,
        }

        if not clean_folder_id:
            summary["error"] = "Invalid or empty folder_id"
            return summary

        # Check if live application synchronization is enabled before attempting retrieval
        if not getattr(client, "live_applications_enabled", False) and not getattr(client, "transport", None):
            logger.info(
                f"[FounditSync] Live Foundit application retrieval is disabled for folder {clean_folder_id}. "
                "Exiting safely without incrementing failure counters or modifying checkpoints."
            )
            summary["skipped"] = True
            summary["reason"] = "Live application retrieval is disabled (FOUNDIT_LIVE_APPLICATIONS_ENABLED=False)"
            return summary

        # 1. Capture sync_started_at BEFORE the first API call to prevent checkpoint boundary drift
        sync_started_at = timezone.now()

        # Format applications_since safely to UTC ISO 8601
        formatted_since = cls.format_applications_since(applications_since)

        safe_limit = min(int(limit) if limit else cls.DEFAULT_PAGE_SIZE, cls.DEFAULT_PAGE_SIZE)
        if safe_limit < 1:
            safe_limit = 1

        page_number = 1
        max_pages_to_run = min(int(max_pages), cls.MAX_PAGES_SAFETY_LIMIT) if max_pages else cls.MAX_PAGES_SAFETY_LIMIT

        while page_number <= max_pages_to_run:
            try:
                response = client.get_applications(
                    folder_id=clean_folder_id,
                    page_number=page_number,
                    limit=safe_limit,
                    applications_since=formatted_since
                )
            except Exception as e:
                from applications.integrations.foundit.client import FounditContractUnverifiedException
                if isinstance(e, FounditContractUnverifiedException):
                    logger.info(f"[FounditSync] Live retrieval blocked by safety guard for folder {clean_folder_id}: {e}")
                    summary["skipped"] = True
                    summary["reason"] = str(e)
                    return summary
                logger.error(f"[FounditSync] Error fetching page {page_number} for folder {clean_folder_id}: {e}")
                summary["error"] = str(e)
                break

            summary["pages_fetched"] += 1

            # Unpack official {"success": true, "data": {...}} or flat mock dictionary
            data_envelope = response.get("data") if (isinstance(response, dict) and isinstance(response.get("data"), dict)) else response
            if not isinstance(data_envelope, dict):
                data_envelope = {}

            total_job_apps = data_envelope.get("total_job_applications", 0)
            summary["total_job_applications"] = total_job_apps

            apps = data_envelope.get("applications", [])
            if not isinstance(apps, list) or len(apps) == 0:
                break

            env_folder_id = str(data_envelope.get("folder_id") or clean_folder_id).strip()

            for app_dict in apps:
                if not isinstance(app_dict, dict):
                    summary["failed_errors"] += 1
                    continue
                summary["total_fetched"] += 1
                if not app_dict.get("folder_id") and not app_dict.get("folderId"):
                    app_dict["folder_id"] = env_folder_id

                res = FounditCandidateIngestionService.ingest_candidate(app_dict)
                if res.get("success"):
                    if res.get("duplicate"):
                        summary["duplicates_skipped"] += 1
                    else:
                        summary["new_ingested"] += 1
                else:
                    if res.get("code") == "UNMATCHED_FOLDER_ID":
                        summary["unmatched_errors"] += 1
                    else:
                        summary["failed_errors"] += 1

            # Termination 1: All available applications fetched
            if total_job_apps > 0 and summary["total_fetched"] >= total_job_apps:
                break

            # Termination 2: Received fewer records than requested page limit
            if len(apps) < safe_limit:
                break

            page_number += 1

        # Checkpoint advancement and quarantine management
        consecutive_errors_key = f"foundit_folder_consecutive_errors_{clean_folder_id}"
        posting = JobBoardPosting.objects.filter(
            job_board=FOUNDIT_JOB_BOARD_NAME,
            external_job_id=clean_folder_id
        ).first()

        total_errs = summary["failed_errors"] + summary["unmatched_errors"]
        has_api_err = bool(summary.get("error"))

        if total_errs == 0 and not has_api_err:
            # Clean sync: Reset consecutive error counter and advance checkpoint to sync_started_at
            cache.delete(consecutive_errors_key)
            if posting:
                try:
                    posting.last_synced_at = sync_started_at
                    if posting.error_message:
                        posting.error_message = ""
                    posting.save(update_fields=["last_synced_at", "error_message"])
                except Exception as e:
                    logger.warning(f"[FounditSync] Could not update last_synced_at checkpoint for folder {clean_folder_id}: {e}")
        else:
            # Errors occurred: Differentiate between retry window and permanent quarantine
            curr_consecutive = (cache.get(consecutive_errors_key) or 0) + 1
            cache.set(consecutive_errors_key, curr_consecutive, timeout=86400)

            if curr_consecutive < cls.MAX_CONSECUTIVE_FOLDER_ERRORS:
                # Hold checkpoint to allow retry on next scheduled run
                logger.warning(
                    f"[FounditSync] Folder {clean_folder_id} encountered {total_errs} error(s). "
                    f"Retry attempt {curr_consecutive}/{cls.MAX_CONSECUTIVE_FOLDER_ERRORS}. Checkpoint held."
                )
            else:
                # Threshold reached: Quarantine failing applications and advance checkpoint to avoid stalling folder
                logger.error(
                    f"[FounditSync] Folder {clean_folder_id} reached maximum retries ({cls.MAX_CONSECUTIVE_FOLDER_ERRORS}). "
                    f"Quarantining failing applications and advancing checkpoint to prevent permanent synchronization stall."
                )
                summary["quarantined"] = True
                cache.delete(consecutive_errors_key)
                if posting:
                    try:
                        posting.error_message = (
                            f"Quarantined {summary['failed_errors']} failed and {summary['unmatched_errors']} "
                            f"unmatched application(s) after {cls.MAX_CONSECUTIVE_FOLDER_ERRORS} retries at {sync_started_at.isoformat()}."
                        )
                        posting.last_synced_at = sync_started_at
                        posting.save(update_fields=["last_synced_at", "error_message"])
                    except Exception as e:
                        logger.warning(f"[FounditSync] Could not save quarantine state for folder {clean_folder_id}: {e}")

        return summary

    @classmethod
    def sync_all_published_jobs(cls, client=None, max_pages=MAX_PAGES_SAFETY_LIMIT):
        """
        Identifies active/published Foundit JobBoardPosting records,
        extracts external_job_id (folder_id), and synchronizes applications.
        Uses Redis cache lock with unique worker token to prevent overlapping runs and safe release.
        """
        if client is None:
            from applications.integrations.foundit.client import FounditClient
            client = FounditClient()

        if not getattr(client, "live_applications_enabled", False) and not getattr(client, "transport", None):
            logger.info(
                "[FounditSync] Scheduled sync skipped: Live Foundit application retrieval is disabled "
                "(FOUNDIT_LIVE_APPLICATIONS_ENABLED=False). Exiting safely."
            )
            return {
                "total_jobs_scanned": 0,
                "job_results": [],
                "total_new_ingested": 0,
                "total_duplicates_skipped": 0,
                "skipped": True,
                "reason": "Live application retrieval is disabled (FOUNDIT_LIVE_APPLICATIONS_ENABLED=False)"
            }

        import uuid
        from django.core.cache import cache

        lock_key = "foundit_sync_all_jobs_lock"
        lock_token = str(uuid.uuid4())
        # 15-minute lock TTL
        lock_acquired = cache.add(lock_key, lock_token, timeout=900)
        if not lock_acquired:
            logger.warning("[FounditSync] sync_all_published_jobs run already in progress. Skipping overlapping schedule.")
            return {
                "total_jobs_scanned": 0,
                "job_results": [],
                "total_new_ingested": 0,
                "total_duplicates_skipped": 0,
                "skipped": True,
                "reason": "Task already running"
            }

        try:
            active_postings = JobBoardPosting.objects.filter(
                job_board=FOUNDIT_JOB_BOARD_NAME,
                status='PUBLISHED'
            ).exclude(external_job_id='')

            results = {
                "total_jobs_scanned": active_postings.count(),
                "job_results": [],
                "total_new_ingested": 0,
                "total_duplicates_skipped": 0,
            }

            for posting in active_postings:
                folder_id = posting.external_job_id
                # Preserve overlap window for incremental synchronization
                app_since_str = None
                if posting.last_synced_at:
                    overlap_time = posting.last_synced_at - datetime.timedelta(minutes=cls.OVERLAP_WINDOW_MINUTES)
                    app_since_str = cls.format_applications_since(overlap_time)

                job_summary = cls.sync_applications_for_folder(
                    folder_id=folder_id,
                    client=client,
                    max_pages=max_pages,
                    applications_since=app_since_str
                )
                results["job_results"].append(job_summary)
                results["total_new_ingested"] += job_summary.get("new_ingested", 0)
                results["total_duplicates_skipped"] += job_summary.get("duplicates_skipped", 0)

            return results
        finally:
            cls._release_lock(lock_key, lock_token)
