"""
Management command to publish a single explicitly selected ATS job to Foundit.
Usage:
python backend/manage.py publish_foundit_job --job-id=<ID>
"""
import json
from django.core.management.base import BaseCommand, CommandError
from applications.models import Application
from applications.integrations.foundit.job_posting import FounditJobPostingService
from applications.integrations.foundit.mappers import FounditJobMapper
from applications.integrations.foundit.constants import get_foundit_credentials

class Command(BaseCommand):
    help = "Publishes a single explicitly selected ATS job (Application where candidate_name='') to Foundit."

    def add_arguments(self, parser):
        parser.add_argument(
            "--job-id",
            type=int,
            required=True,
            help="The ID of the ATS job Application (where candidate_name='') to publish."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="If provided, validates data and prints payload without executing the Foundit HTTP request."
        )

    def handle(self, *args, **options):
        job_id = options["job_id"]
        dry_run = options["dry_run"]

        try:
            job = Application.objects.get(id=job_id, candidate_name="")
        except Application.DoesNotExist:
            raise CommandError(f"ATS Job Application with ID {job_id} (and candidate_name='') does not exist.")

        self.stdout.write(self.style.SUCCESS(f"Selected ATS Job ID: {job.id}"))
        self.stdout.write(f"  Title/Position: {job.position}")
        self.stdout.write(f"  City/State: {job.city}, {job.state}")
        self.stdout.write(f"  Client Name: {job.client_name}")

        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
        sanitized_payload = json.dumps(payload, indent=2)
        self.stdout.write("\nSanitized Payload Summary:")
        self.stdout.write(sanitized_payload)

        if dry_run:
            self.stdout.write(self.style.WARNING("\nDry run requested. Skipping actual Foundit API call."))
            return

        creds = get_foundit_credentials()
        missing = [k for k in ["api_key", "corp_id", "username", "password", "channel_id", "sub_channel_id"] if not creds.get(k)]
        if missing:
            self.stdout.write(self.style.WARNING(f"\nLive Foundit credentials not configured (missing: {', '.join(missing)})."))
            self.stdout.write("LIVE JOB POSTING: NOT RUN — credentials not configured.")
            return

        self.stdout.write("\nExecuting Live Foundit Job Posting...")
        posting = FounditJobPostingService.publish_job(job)

        self.stdout.write(self.style.SUCCESS("\nResult:"))
        self.stdout.write(f"  JobBoardPosting Status: {posting.status}")
        self.stdout.write(f"  Foundit folderId (external_job_id): {posting.external_job_id or 'N/A'}")
        if posting.error_message:
            self.stdout.write(self.style.ERROR(f"  Error Message: {posting.error_message}"))
