import re
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

def extract_skills(text: str) -> set:
    """
    Deterministically extracts and normalizes skills from a comma/slash separated string or raw text.
    """
    if not text or text.strip() == 'N/A':
        return set()
    
    # Split by comma, slash, or newline
    raw_skills = re.split(r'[,/\n]+', text)
    skills = set()
    for s in raw_skills:
        clean_s = s.strip().lower()
        if clean_s:
            skills.add(clean_s)
    return skills

def calculate_skills_score(job_technology: str, resume_skills: str, resume_text: str) -> float:
    """
    Calculates skill match (30% weight).
    """
    required_skills = extract_skills(job_technology)
    if not required_skills:
        return 100.0  # If no skills required, full score
        
    candidate_skills = extract_skills(resume_skills)
    resume_text_lower = resume_text.lower() if resume_text else ""
    
    matched = 0
    for req in required_skills:
        if req in candidate_skills:
            matched += 1
        else:
            # Fallback to regex search in raw text
            # Use word boundaries to avoid partial matches (e.g. "C" in "Mac")
            # Escape regex characters in the requirement
            escaped_req = re.escape(req)
            if re.search(rf'\b{escaped_req}\b', resume_text_lower):
                matched += 1
                
    return (matched / len(required_skills)) * 100.0

def calculate_experience_score(job_exp, candidate_exp) -> float:
    """
    Calculates experience score (15% weight).
    If candidate >= required: 100%
    If candidate is exactly 1 year short: 80%
    If candidate is 2-3 years short: 50%
    If candidate < half required: 10%
    """
    try:
        req = float(job_exp) if job_exp is not None else 0.0
        can = float(candidate_exp) if candidate_exp is not None else 0.0
    except (ValueError, TypeError):
        return 50.0 # Default if invalid data
        
    if req <= 0:
        return 100.0
        
    if can >= req:
        return 100.0
        
    shortfall = req - can
    if shortfall <= 1.0:
        return 80.0
    elif shortfall <= 3.0:
        return 50.0
    elif can < (req / 2):
        return 10.0
    else:
        return 40.0

def calculate_title_score(job_position: str, resume_text: str, current_company: str, qualification: str) -> float:
    """
    Calculates title relevance (10% weight).
    Checks if job position tokens exist in resume.
    """
    if not job_position or job_position.strip() == 'N/A':
        return 100.0
        
    position_lower = job_position.lower().strip()
    resume_text_lower = resume_text.lower() if resume_text else ""
    current_company_lower = current_company.lower() if current_company else ""
    qualification_lower = qualification.lower() if qualification else ""
    
    # Exact match in raw text
    if position_lower in resume_text_lower or position_lower in qualification_lower or position_lower in current_company_lower:
        return 100.0
        
    # Token match
    tokens = [t for t in re.split(r'\W+', position_lower) if len(t) > 2]
    if not tokens:
        return 50.0
        
    matched_tokens = sum(1 for t in tokens if t in resume_text_lower or t in qualification_lower or t in current_company_lower)
    return (matched_tokens / len(tokens)) * 100.0

def calculate_education_location_score(job, applicant) -> float:
    """
    Calculates education/location match (5% weight).
    Simple deterministic match.
    """
    score = 50.0 # Base score
    
    # Education
    if applicant.qualification and applicant.qualification.lower() != 'n/a':
        score += 25.0 # Give credit for having a valid qualification listed
        
    # Location
    job_city = job.city.lower().strip() if job.city else ""
    app_city = applicant.city.lower().strip() if applicant.city else ""
    
    if job_city and app_city and job_city == app_city:
        score += 25.0
    elif not job_city:
        score += 25.0 # Job doesn't care about location
        
    return min(100.0, score)

def calculate_hybrid_score(job, applicant, resume_text: str, semantic_score: float) -> dict:
    """
    Calculates the final hybrid score and returns the breakdown.
    Weights:
    Semantic: 40%
    Skills: 30%
    Experience: 15%
    Title: 10%
    Education/Location: 5%
    """
    # 1. Semantic (40%)
    score_semantic = semantic_score if semantic_score is not None else 0.0
    
    # 2. Skills (30%)
    score_skills = calculate_skills_score(job.technology, applicant.primary_skills, resume_text)
    
    # 3. Experience (15%)
    score_experience = calculate_experience_score(job.experience, applicant.years_of_experience)
    
    # 4. Title (10%)
    score_title = calculate_title_score(job.position, resume_text, applicant.current_company, applicant.qualification)
    
    # 5. Education/Location (5%)
    score_education = calculate_education_location_score(job, applicant)
    
    # Apply weights
    final_score = (
        (score_semantic * 0.40) +
        (score_skills * 0.30) +
        (score_experience * 0.15) +
        (score_title * 0.10) +
        (score_education * 0.05)
    )
    
    return {
        "final_score": round(final_score, 2),
        "score_semantic": round(score_semantic, 2),
        "score_skills": round(score_skills, 2),
        "score_experience": round(score_experience, 2),
        "score_title": round(score_title, 2),
        "score_education": round(score_education, 2)
    }
