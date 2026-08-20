import logging
from django.utils import timezone
from applications.models import CareerPortalApplicant
from applications.ai.extractor import extract_resume_text
from applications.ai.embeddings import generate_embedding
from applications.ai.scorer import calculate_match_score

logger = logging.getLogger(__name__)

def build_job_description_text(job) -> str:
    """
    Constructs comprehensive Job Description text from job opening fields and remarks.
    """
    parts = []
    if job.position and job.position != 'N/A':
        parts.append(f"Job Title: {job.position}")
    if job.technology and job.technology != 'N/A':
        parts.append(f"Required Skills / Technology: {job.technology}")
    if job.remarks:
        parts.append(f"Job Overview:\n{job.remarks}")
    return "\n\n".join(parts).strip()

def process_applicant_ai_match(applicant_id: int) -> float:
    """
    Coordinates end-to-end AI Resume Shortlisting for a CareerPortalApplicant:
    1. Fetches applicant and associated job description from database.
    2. Downloads resume from S3 and extracts text into memory.
    3. Generates vector embeddings for Job Description and Resume.
    4. Computes Cosine Similarity percentage score.
    5. Saves ONLY ai_match_score and ai_scored_at to database.
    """
    try:
        applicant = CareerPortalApplicant.objects.select_related('job').filter(id=applicant_id).first()
        if not applicant:
            logger.error(f"[AI Service] CareerPortalApplicant with ID={applicant_id} not found.")
            return None

        if not applicant.resume:
            logger.warning(f"[AI Service] Applicant ID={applicant_id} has no resume uploaded.")
            return None

        job = applicant.job
        if not job:
            logger.warning(f"[AI Service] Applicant ID={applicant_id} has no associated job opening.")
            return None

        # 1. Build Job Description Text
        job_text = build_job_description_text(job)
        if not job_text:
            logger.warning(f"[AI Service] Empty Job Description for Job ID={job.id}.")
            return None

        # 2. Extract Resume Text from S3 into memory
        resume_text = extract_resume_text(applicant.resume)
        if not resume_text:
            logger.warning(f"[AI Service] Failed to extract text from resume for Applicant ID={applicant_id}.")
            return None

        # 3. Generate Vector Embeddings
        if job.ai_job_embedding:
            job_embedding = job.ai_job_embedding
            logger.info(f"[AI Service] Reused cached job embedding for Job ID={job.id}")
        else:
            job_embedding_raw = generate_embedding(job_text)
            if job_embedding_raw is not None:
                job_embedding = job_embedding_raw.tolist() if hasattr(job_embedding_raw, 'tolist') else list(job_embedding_raw)
                job.ai_job_embedding = job_embedding
                job.save(update_fields=['ai_job_embedding', 'updated_at'])
                logger.info(f"[AI Service] Generated and cached new job embedding for Job ID={job.id}")
            else:
                job_embedding = None

        resume_embedding = generate_embedding(resume_text)

        if job_embedding is None or resume_embedding is None:
            logger.error(f"[AI Service] Embedding generation failed for Applicant ID={applicant_id}.")
            return None

        # 4. Calculate Cosine Similarity Match Score
        score = calculate_match_score(job_embedding, resume_embedding)

        if score is not None:
            # 5. Save ONLY ai_match_score and ai_scored_at fields in database
            applicant.ai_match_score = score
            applicant.ai_scored_at = timezone.now()
            applicant.save(update_fields=['ai_match_score', 'ai_scored_at', 'updated_at'])
            logger.info(f"[AI Service] Successfully scored Applicant ID={applicant_id}: AI Match Score = {score}%")
            return score

        return None

    except Exception:
        logger.exception(f"[AI Service] Exception occurred during AI shortlisting for Applicant ID={applicant_id}")
        return None
