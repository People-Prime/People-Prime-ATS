import time
from django.core.management.base import BaseCommand
from applications.models import CareerPortalApplicant
from applications.ai.tasks import score_applicant_resume_task

class Command(BaseCommand):
    help = 'Bulk process AI resume matching through the dedicated Celery AI queue'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Force re-scoring of already scored applicants')
        parser.add_argument('--limit', type=int, help='Maximum number of applicants to queue')
        parser.add_argument('--job-id', type=int, help='Filter by specific job ID')
        parser.add_argument('--source', type=str, help='Filter by specific source (e.g., LinkedIn)')

    def handle(self, *args, **options):
        force = options['force']
        limit = options['limit']
        job_id = options['job_id']
        source = options['source']

        # Base query
        qs = CareerPortalApplicant.objects.all().order_by('id')

        if job_id:
            qs = qs.filter(job_id=job_id)
        if source:
            qs = qs.filter(source__icontains=source)

        total_matching = qs.count()
        
        # Skip already scored unless forced
        if not force:
            qs = qs.filter(ai_match_score__isnull=True)
            
        skipped = total_matching - qs.count()

        # Apply limit if specified
        if limit:
            qs = qs[:limit]

        applicants_to_process = list(qs)
        queued = len(applicants_to_process)

        self.stdout.write(self.style.SUCCESS(f"Total applicants matching filters: {total_matching}"))
        self.stdout.write(self.style.WARNING(f"Skipped (already scored): {skipped}"))
        self.stdout.write(self.style.SUCCESS(f"Queued for processing: {queued}"))

        if queued == 0:
            self.stdout.write(self.style.WARNING("No applicants to process. Exiting."))
            return

        self.stdout.write(self.style.NOTICE("Dispatching tasks to the 'ai_queue'..."))
        
        results = []
        for app in applicants_to_process:
            # Dispatch to Celery
            async_res = score_applicant_resume_task.delay(app.id)
            results.append((app.id, async_res))

        self.stdout.write(self.style.NOTICE("Waiting for tasks to complete... (Press Ctrl+C to abort waiting; tasks will still run in background)"))
        
        completed = 0
        failed = 0
        
        try:
            for i, (app_id, async_res) in enumerate(results, 1):
                try:
                    # Wait up to 200 seconds for each task (slightly above the 180s hard limit)
                    score = async_res.get(timeout=200)
                    if score is not None:
                        completed += 1
                        self.stdout.write(f"[{i}/{queued}] Applicant {app_id}: Success (Score: {score})")
                    else:
                        failed += 1
                        self.stdout.write(self.style.ERROR(f"[{i}/{queued}] Applicant {app_id}: Failed (Returned None)"))
                except Exception as e:
                    failed += 1
                    self.stdout.write(self.style.ERROR(f"[{i}/{queued}] Applicant {app_id}: Failed with Exception ({str(e)})"))
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("\nScript aborted by user. Tasks are still running in Celery! Re-run without --force to resume waiting for remaining items."))
            return

        self.stdout.write(self.style.SUCCESS("-" * 30))
        self.stdout.write(self.style.SUCCESS(f"Execution Summary:"))
        self.stdout.write(self.style.SUCCESS(f"Total Evaluated: {total_matching}"))
        self.stdout.write(self.style.WARNING(f"Skipped: {skipped}"))
        self.stdout.write(self.style.SUCCESS(f"Completed Successfully: {completed}"))
        self.stdout.write(self.style.ERROR(f"Failed: {failed}"))
