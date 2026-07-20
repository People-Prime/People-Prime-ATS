import re
import datetime
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def auto_close_expired_jobs():
    """
    Daily Celery Beat task: Automatically close any job posting whose
    Start Date has passed (today > Start Date).
    Runs every day at midnight (00:05 server time).
    """
    from applications.models import Application

    today = timezone.now().date()
    closed_count = 0

    try:
        active_jobs = Application.objects.filter(
            candidate_name='',
            remarks__icontains='Job Status: Active'
        )

        for job in active_jobs:
            remarks = job.remarks or ''

            # Extract Start Date from remarks (format: "Start Date: YYYY-MM-DD")
            match = re.search(
                r'^Start Date:\s*(\d{4}-\d{2}-\d{2})',
                remarks,
                re.MULTILINE | re.IGNORECASE
            )
            if not match:
                continue

            try:
                start_date = datetime.date.fromisoformat(match.group(1).strip())
            except ValueError:
                continue

            # Close if today is past the start date
            if today > start_date:
                new_remarks = re.sub(
                    r'(^Job Status:\s*)Active',
                    r'\1Closed',
                    remarks,
                    flags=re.MULTILINE | re.IGNORECASE
                )
                job.remarks = new_remarks
                job.save(update_fields=['remarks'])
                closed_count += 1
                logger.info(f"[AUTO-CLOSE] Closed job ID={job.id}, Start Date={start_date}")

        logger.info(f"[AUTO-CLOSE] Daily job auto-close complete. {closed_count} job(s) closed.")
    except Exception as e:
        logger.error(f"[AUTO-CLOSE] Error during daily job auto-close: {e}")

    return closed_count
