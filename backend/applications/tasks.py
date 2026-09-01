import re
import datetime
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def auto_close_expired_jobs():
    """
    Daily Celery Beat task: Automatically close any job posting created before today,
    or whose Start Date has passed.
    Runs every day at midnight (00:05 server time).
    """
    from applications.models import Application

    today = timezone.now().date()
    closed_count = 0

    try:
        # Fetch active job postings (candidate_name='' denotes a Job Posting record)
        active_jobs = Application.objects.filter(
            candidate_name=''
        ).exclude(status='Closed')

        for job in active_jobs:
            remarks = job.remarks or ''
            should_close = False

            # Check 1: Created on a previous date
            if job.created_at and job.created_at.date() < today:
                should_close = True

            # Check 2: Start Date in remarks has passed
            match = re.search(
                r'Start Date:\s*(\d{4}-\d{2}-\d{2})',
                remarks,
                re.IGNORECASE
            )
            if match:
                try:
                    start_date = datetime.date.fromisoformat(match.group(1).strip())
                    if today > start_date:
                        should_close = True
                except ValueError:
                    pass

            if should_close:
                if re.search(r'Job Status:\s*Active', remarks, re.IGNORECASE):
                    new_remarks = re.sub(
                        r'(Job Status:\s*)Active',
                        r'\1Closed',
                        remarks,
                        flags=re.IGNORECASE
                    )
                    job.remarks = new_remarks
                
                job.status = 'Closed'
                job.save(update_fields=['remarks', 'status'])
                closed_count += 1
                logger.info(f"[AUTO-CLOSE] Closed job ID={job.id}, Position={job.position}")

        logger.info(f"[AUTO-CLOSE] Daily job auto-close complete. {closed_count} job(s) closed.")
    except Exception as e:
        logger.error(f"[AUTO-CLOSE] Error during daily job auto-close: {e}")

    return closed_count

