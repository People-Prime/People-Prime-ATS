import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from applications.models import Application, CareerPortalApplicant
from applications.ai.service import build_job_description_text, process_applicant_ai_match
from applications.ai.embeddings import generate_embedding

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Backfills NVIDIA Nemotron 2048-dim vectors using pgvector storage fields.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, help='Limit the number of records to process.')
        parser.add_argument('--batch-size', type=int, default=10, help='Batch size for database updates.')

    def handle(self, *args, **options):
        limit = options.get('limit')
        batch_size = options.get('batch-size', 10)

        self.stdout.write(self.style.NOTICE("--- Starting Nemotron pgvector Backfill ---"))

        # Phase A: Backfill Jobs first
        self.stdout.write(self.style.NOTICE("Phase A: Backfilling Job Postings..."))
        jobs_qs = Application.objects.filter(job_embedding__isnull=True)
        if limit:
            jobs_qs = jobs_qs[:limit]

        jobs_count = jobs_qs.count()
        self.stdout.write(f"Found {jobs_count} jobs needing embeddings.")

        processed_jobs = 0
        for job in jobs_qs:
            try:
                job_text = build_job_description_text(job)
                if not job_text:
                    continue
                
                embedding_raw = generate_embedding(job_text, input_type="passage")
                if embedding_raw is not None:
                    job.job_embedding = embedding_raw.tolist() if hasattr(embedding_raw, 'tolist') else list(embedding_raw)
                    job.embedding_model = "nvidia/nemotron-3-embed-1b"
                    job.embedding_dimension = 2048
                    job.embedding_version = "nemotron-v1"
                    job.embedding_generated_at = timezone.now()
                    job.save(update_fields=['job_embedding', 'embedding_model', 'embedding_dimension', 'embedding_version', 'embedding_generated_at', 'updated_at'])
                    processed_jobs += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed job ID={job.id}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully backfilled {processed_jobs} job postings.\n"))

        # Phase B: Backfill Resumes
        self.stdout.write(self.style.NOTICE("Phase B: Backfilling Candidate Resumes..."))
        resumes_qs = CareerPortalApplicant.objects.filter(resume_embedding__isnull=True).exclude(resume__exact='')
        if limit:
            resumes_qs = resumes_qs[:limit]

        resumes_count = resumes_qs.count()
        self.stdout.write(f"Found {resumes_count} resumes needing embeddings.")

        processed_resumes = 0
        
        # We don't batch process the actual API calls since process_applicant_ai_match operates on ID, 
        # but we can track progress.
        for applicant in resumes_qs:
            try:
                # The service method handles hashing, reuse, extraction, and generation.
                score = process_applicant_ai_match(applicant.id)
                if score is not None:
                    processed_resumes += 1
                    
                if processed_resumes > 0 and processed_resumes % batch_size == 0:
                    self.stdout.write(f"  Processed {processed_resumes} resumes...")
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed resume ID={applicant.id}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully backfilled {processed_resumes} candidate resumes.\n"))
        self.stdout.write(self.style.SUCCESS("--- Backfill Complete ---"))
