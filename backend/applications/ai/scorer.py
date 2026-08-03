import logging
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

def calculate_match_score(job_embedding, resume_embedding) -> float:
    """
    Calculates cosine similarity between Job Description embedding vector
    and Candidate Resume embedding vector.
    Converts similarity score to a bounded percentage between 0.0% and 100.0%.
    """
    if job_embedding is None or resume_embedding is None:
        logger.error("[AI Scorer] Cannot calculate score: one or both embeddings are None.")
        return None

    try:
        # Reshape for sklearn cosine_similarity (requires 2D arrays: (1, N))
        job_vec = np.array(job_embedding).reshape(1, -1)
        res_vec = np.array(resume_embedding).reshape(1, -1)

        # Compute cosine similarity matrix
        similarity_matrix = cosine_similarity(job_vec, res_vec)
        raw_similarity = float(similarity_matrix[0][0])

        # Cosine similarity ranges from -1.0 to 1.0. Clamp negative values to 0.0.
        clamped_sim = max(0.0, min(1.0, raw_similarity))

        # Convert to percentage score (0.0 - 100.0) rounded to 1 decimal place
        match_score = round(clamped_sim * 100.0, 1)
        return match_score

    except Exception:
        logger.exception("[AI Scorer] Exception occurred while calculating cosine similarity score.")
        return None
