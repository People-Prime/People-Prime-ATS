import logging
import hashlib
from django.utils import timezone
from applications.models import CareerPortalApplicant
from applications.ai.extractor import get_s3_bytes_from_storage, extract_text_from_pdf, extract_text_from_docx
from applications.ai.embeddings import generate_embedding
from applications.ai.scorer import calculate_match_score

logger = logging.getLogger(__name__)

# File size limit: 10 MB
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

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
    1. Builds Job Description string.
    2. Hashes resume bytes to avoid redundant extraction/embedding.
    3. Generates/Retrieves Vector Embeddings (Nemotron-1B via pgvector).
    4. Calculates Cosine Similarity Score.
    5. Saves pgvector fields and match score to database.
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

        # 2. Get Job Embedding (pgvector)
        if job.job_embedding:
            job_embedding = job.job_embedding
            logger.info(f"[AI Service] Reused pgvector job embedding for Job ID={job.id}")
        else:
            job_embedding_raw = generate_embedding(job_text, input_type="passage")
            if job_embedding_raw is not None:
                job_embedding = job_embedding_raw.tolist() if hasattr(job_embedding_raw, 'tolist') else list(job_embedding_raw)
                job.job_embedding = job_embedding
                job.embedding_model = "nvidia/nemotron-3-embed-1b"
                job.embedding_dimension = 2048
                job.embedding_version = "nemotron-v1"
                job.embedding_generated_at = timezone.now()
                job.save(update_fields=['job_embedding', 'embedding_model', 'embedding_dimension', 'embedding_version', 'embedding_generated_at', 'updated_at'])
                logger.info(f"[AI Service] Generated and cached pgvector job embedding for Job ID={job.id}")
            else:
                job_embedding = None

        # 3. Resume Embedding & Hash Reuse Strategy
        resume_embedding = None
        resume_hash = None
        resume_text = None
        
        file_bytes = get_s3_bytes_from_storage(applicant.resume)
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            logger.error(f"[AI Service] File size ({len(file_bytes)} bytes) exceeds max limit for Applicant ID={applicant_id}.")
            return None
            
        resume_hash = hashlib.sha256(file_bytes).hexdigest()
        applicant.resume_content_hash = resume_hash
        
        # Check if another applicant already has this exact resume hashed and embedded
        existing = CareerPortalApplicant.objects.filter(resume_content_hash=resume_hash, resume_embedding__isnull=False).first()
        
        if existing:
            resume_embedding = existing.resume_embedding
            logger.info(f"[AI Service] Hash MATCH ({resume_hash[:8]}). Reused existing pgvector resume embedding for Applicant ID={applicant_id}")
        else:
            # Hash miss, we must extract and embed
            url_lower = applicant.resume.lower()
            if url_lower.endswith(".pdf"):
                resume_text = extract_text_from_pdf(file_bytes)
            elif url_lower.endswith(".docx"):
                resume_text = extract_text_from_docx(file_bytes)
            else:
                logger.error(f"[AI Service] Unsupported file format for resume '{applicant.resume}'.")
                return None
                
            if not resume_text:
                logger.warning(f"[AI Service] Failed to extract text from resume for Applicant ID={applicant_id}.")
                return None
                
            resume_embedding_raw = generate_embedding(resume_text, input_type="passage")
            resume_embedding = resume_embedding_raw.tolist() if hasattr(resume_embedding_raw, 'tolist') else list(resume_embedding_raw) if resume_embedding_raw else None
            logger.info(f"[AI Service] Hash MISS ({resume_hash[:8]}). Extracted and generated pgvector resume embedding for Applicant ID={applicant_id}")

        if job_embedding is None or resume_embedding is None:
            logger.error(f"[AI Service] pgvector embedding generation failed for Applicant ID={applicant_id}.")
            return None
            
        applicant.resume_embedding = resume_embedding
        applicant.embedding_model = "nvidia/nemotron-3-embed-1b"
        applicant.embedding_dimension = 2048
        applicant.embedding_version = "nemotron-v1"
        applicant.embedding_generated_at = timezone.now()

        # 4. Calculate Cosine Similarity Match Score (Semantic Score)
        semantic_score = calculate_match_score(job_embedding, resume_embedding)
        
        # 5. Calculate Hybrid Score
        from applications.ai.hybrid_scorer import calculate_hybrid_score
        # If we hash-matched, resume_text might be None. To compute skills/title we need it.
        # But if it's None, we only use ATS fields, which is acceptable or we can just fetch it again if needed.
        # For full accuracy on hash matches, we should probably fetch it, but to keep it fast, we pass what we have.
        if resume_text is None:
            # We had a hash match, let's extract the text just for the NLP scorer (in-memory)
            # This is fast since we already have file_bytes
            url_lower = applicant.resume.lower()
            if url_lower.endswith(".pdf"):
                resume_text = extract_text_from_pdf(file_bytes)
            elif url_lower.endswith(".docx"):
                resume_text = extract_text_from_docx(file_bytes)
                
        hybrid_results = calculate_hybrid_score(job, applicant, resume_text, semantic_score)

        if hybrid_results["final_score"] is not None:
            # 6. Save all pgvector fields and hybrid match score to database
            applicant.score_semantic = hybrid_results["score_semantic"]
            applicant.score_skills = hybrid_results["score_skills"]
            applicant.score_experience = hybrid_results["score_experience"]
            applicant.score_title = hybrid_results["score_title"]
            applicant.score_education = hybrid_results["score_education"]
            applicant.ai_match_score = hybrid_results["final_score"]
            applicant.ai_match_score_nemotron = hybrid_results["final_score"]
            applicant.ai_scored_at = timezone.now()
            
            applicant.save(update_fields=[
                'resume_embedding', 'resume_content_hash', 
                'embedding_model', 'embedding_dimension', 'embedding_version', 'embedding_generated_at',
                'score_semantic', 'score_skills', 'score_experience', 'score_title', 'score_education',
                'ai_match_score', 'ai_match_score_nemotron', 'ai_scored_at', 'updated_at'
            ])
            logger.info(f"[AI Service] Successfully scored Applicant ID={applicant_id} with Hybrid Nemotron: Score = {hybrid_results['final_score']}%")
            return hybrid_results['final_score']

        return None

    except Exception:
        logger.exception(f"[AI Service] Exception occurred while processing AI Match for Applicant ID={applicant_id}")
        return None
