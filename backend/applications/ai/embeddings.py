import os
import time
import logging
from openai import OpenAI
import openai

logger = logging.getLogger(__name__)

# Model name: nvidia/nemotron-3-embed-1b
MODEL_NAME = os.getenv('NVIDIA_EMBEDDING_MODEL', 'nvidia/nemotron-3-embed-1b')

def get_openai_client() -> OpenAI:
    """
    Retrieves configured OpenAI client pointing to NVIDIA NIM base URL.
    """
    api_key = os.getenv("NVIDIA_API_KEY")
    base_url = os.getenv("NVIDIA_EMBEDDING_BASE_URL", "https://integrate.api.nvidia.com/v1")
    
    if not api_key:
        raise ValueError("NVIDIA_API_KEY environment variable is not set.")
        
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=30.0, # 30s timeout per request
    )

def generate_embeddings(texts: list[str], input_type: str = "passage"):
    """
    Generates sentence embedding vectors for input texts using NVIDIA API.
    Handles rate limits, timeouts, and validation.
    """
    if not texts:
        return []
        
    if not isinstance(texts, list):
        texts = [texts]

    # Validate input type
    if input_type not in ["passage", "query"]:
        logger.warning(f"Unexpected input_type '{input_type}', defaulting to 'passage'")
        input_type = "passage"

    client = get_openai_client()
    
    max_retries = 3
    base_delay = 2
    
    for attempt in range(max_retries):
        try:
            response = client.embeddings.create(
                input=texts,
                model=MODEL_NAME,
                encoding_format="float",
                extra_body={"input_type": input_type}
            )
            
            embeddings = [data.embedding for data in response.data]
            
            # Validate Dimension
            expected_dim = 2048
            for i, emb in enumerate(embeddings):
                if len(emb) != expected_dim:
                    raise ValueError(f"Unexpected dimension: {len(emb)}. Expected {expected_dim}")
                    
            return embeddings
            
        except openai.AuthenticationError as e:
            logger.error(f"[AI Embeddings] Authentication failed with NVIDIA API. Check NVIDIA_API_KEY: {e}")
            raise # Permanent error, do not retry
            
        except openai.BadRequestError as e:
            logger.error(f"[AI Embeddings] Bad Request (e.g. text too long): {e}")
            raise # Permanent error, do not retry
            
        except (openai.APIConnectionError, openai.RateLimitError, openai.APITimeoutError, openai.APIError) as e:
            if attempt == max_retries - 1:
                logger.error(f"[AI Embeddings] Failed after {max_retries} attempts. Last error: {e}")
                raise
            
            sleep_time = base_delay * (2 ** attempt)
            logger.warning(f"[AI Embeddings] Transient error (attempt {attempt+1}/{max_retries}). Retrying in {sleep_time}s... Error: {e}")
            time.sleep(sleep_time)
            
        except Exception as e:
            logger.exception(f"[AI Embeddings] Unexpected exception generating embedding: {e}")
            raise

def generate_embedding(text: str, input_type: str = "passage"):
    """
    Convenience method for a single string.
    """
    if not text or not text.strip():
        return None
    
    try:
        embeddings = generate_embeddings([text], input_type=input_type)
        return embeddings[0] if embeddings else None
    except Exception:
        return None
