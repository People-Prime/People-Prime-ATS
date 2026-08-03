import io
import os
import logging
from urllib.parse import urlparse
import boto3
from django.conf import settings

logger = logging.getLogger(__name__)

# File size limit: 10 MB (10 * 1024 * 1024 bytes)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

def get_s3_bytes_from_storage(resume_path_or_url: str) -> bytes:
    """
    Downloads file bytes directly from Amazon S3 using AWS credentials configured in settings.
    """
    if not resume_path_or_url:
        raise ValueError("Resume path or URL is empty.")

    # Extract S3 object key if full URL is passed
    if resume_path_or_url.startswith("http://") or resume_path_or_url.startswith("https://"):
        parsed = urlparse(resume_path_or_url)
        key = parsed.path.lstrip('/')
    else:
        key = resume_path_or_url.lstrip('/')

    bucket_name = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage'))
    region = getattr(settings, 'AWS_S3_REGION_NAME', os.getenv('AWS_S3_REGION_NAME', 'ap-south-1'))
    access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', os.getenv('AWS_ACCESS_KEY_ID'))
    secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', os.getenv('AWS_SECRET_ACCESS_KEY'))

    if access_key and secret_key:
        s3_client = boto3.client(
            's3',
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
    else:
        s3_client = boto3.client('s3', region_name=region)

    response = s3_client.get_object(Bucket=bucket_name, Key=key)
    return response['Body'].read()

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extracts plain text from PDF bytes using PyMuPDF (fitz).
    """
    import fitz  # PyMuPDF
    text_chunks = []
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for page in doc:
            text_chunks.append(page.get_text())
    return "\n".join(text_chunks).strip()

def extract_text_from_docx(file_bytes: bytes) -> str:
    """
    Extracts plain text from DOCX bytes using python-docx.
    """
    import docx
    doc = docx.Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    return "\n".join(paragraphs).strip()

def extract_resume_text(resume_path_or_url: str) -> str:
    """
    Extracts text from a candidate resume stored in S3.
    Supports ONLY PDF and DOCX formats. All text is kept strictly in memory.
    """
    try:
        file_bytes = get_s3_bytes_from_storage(resume_path_or_url)

        # Validate file size before extraction
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            logger.error(f"[AI Extractor] File size ({len(file_bytes)} bytes) exceeds maximum limit of {MAX_FILE_SIZE_BYTES} bytes.")
            return ""

        url_lower = resume_path_or_url.lower()

        if url_lower.endswith(".pdf"):
            return extract_text_from_pdf(file_bytes)
        elif url_lower.endswith(".docx"):
            return extract_text_from_docx(file_bytes)
        else:
            logger.error(f"[AI Extractor] Unsupported file format for resume '{resume_path_or_url}'. Only PDF and DOCX are supported.")
            return ""

    except Exception:
        logger.exception(f"[AI Extractor] Exception occurred while extracting text from resume: '{resume_path_or_url}'")
        return ""
