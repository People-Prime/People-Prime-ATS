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

        if resume_download_url and resume_download_url.startswith("http"):
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
                    res = requests.get(resume_download_url, timeout=10)
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
                        s3_client.put_object(
                            Bucket=bucket_name,
                            Key=filename,
                            Body=res.content,
                            ContentType='application/pdf'
                        )
                        s3_resume_link = f"s3://{bucket_name}/{filename}"
            except Exception as e:
                logger.warning(f"[FounditIngestion] S3 streaming fallback to URL. Error: {e}")
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
