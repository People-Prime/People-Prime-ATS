"""
Foundit Candidate Ingestion Service.
Processes candidate application data retrieved from Foundit, performs folder_id lookup,
enforces duplicate protection, streams resume binaries to AWS S3, creates CareerPortalApplicant (source="Foundit"),
and dispatches existing Nemotron AI resume scoring tasks.
"""
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
            existing = CareerPortalApplicant.objects.filter(foundit_application_id=foundit_app_id).first()
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
        applicant_data = FounditCandidateMapper.map_foundit_application_to_applicant(application_dict, target_job)
        if s3_resume_link:
            applicant_data["resume"] = s3_resume_link

        applicant = CareerPortalApplicant.objects.create(**applicant_data)
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
        }

        if not clean_folder_id:
            summary["error"] = "Invalid or empty folder_id"
            return summary

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
                    applications_since=applications_since
                )
            except Exception as e:
                logger.error(f"[FounditSync] Error fetching page {page_number} for folder {clean_folder_id}: {e}")
                summary["error"] = str(e)
                break

            summary["pages_fetched"] += 1
            total_job_apps = response.get("total_job_applications", 0)
            summary["total_job_applications"] = total_job_apps

            apps = response.get("applications", [])
            if not isinstance(apps, list) or len(apps) == 0:
                break

            for app_dict in apps:
                summary["total_fetched"] += 1
                if not app_dict.get("folder_id") and not app_dict.get("folderId"):
                    app_dict["folder_id"] = clean_folder_id

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

        return summary

    @classmethod
    def sync_all_published_jobs(cls, client=None, max_pages=MAX_PAGES_SAFETY_LIMIT):
        """
        Identifies active/published Foundit JobBoardPosting records,
        extracts external_job_id (folder_id), and synchronizes applications.
        """
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
            job_summary = cls.sync_applications_for_folder(
                folder_id=folder_id,
                client=client,
                max_pages=max_pages
            )
            results["job_results"].append(job_summary)
            results["total_new_ingested"] += job_summary.get("new_ingested", 0)
            results["total_duplicates_skipped"] += job_summary.get("duplicates_skipped", 0)

        return results
