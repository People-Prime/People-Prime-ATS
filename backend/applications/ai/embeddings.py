import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

# Model name: text-embedding-3-small
MODEL_NAME = 'text-embedding-3-small'

def get_openai_client() -> OpenAI:
    """
    Retrieves configured OpenAI client reading from environment.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)

def generate_embedding(text: str):
    """
    Generates sentence embedding vector for input text using OpenAI API.
    Specifies dimensions=384 to maintain exact database schema compatibility.
    """
    if not text or not text.strip():
        raise ValueError("Input text for embedding generation is empty.")

    try:
        client = get_openai_client()
        response = client.embeddings.create(
            input=text,
            model=MODEL_NAME,
            dimensions=384
        )
        return response.data[0].embedding
    except Exception:
        logger.exception("[AI Embeddings] Exception occurred while generating embedding via OpenAI.")
        return None
