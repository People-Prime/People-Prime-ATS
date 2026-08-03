import threading
import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Model name: all-MiniLM-L6-v2
MODEL_NAME = 'all-MiniLM-L6-v2'

_model_instance = None
_model_lock = threading.Lock()

def get_transformer_model() -> SentenceTransformer:
    """
    Thread-safe Singleton loader for SentenceTransformer model.
    Loads the model into memory exactly once per process.
    """
    global _model_instance
    if _model_instance is None:
        with _model_lock:
            if _model_instance is None:
                logger.info(f"[AI Embeddings] Loading SentenceTransformer model '{MODEL_NAME}' into memory...")
                _model_instance = SentenceTransformer(MODEL_NAME)
                logger.info(f"[AI Embeddings] Model '{MODEL_NAME}' loaded successfully.")
    return _model_instance

def generate_embedding(text: str):
    """
    Generates sentence embedding vector for input text.
    Returns numpy array embedding vector.
    """
    if not text or not text.strip():
        raise ValueError("Input text for embedding generation is empty.")

    try:
        model = get_transformer_model()
        # Encode text into 384-dimensional vector embedding
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding
    except Exception:
        logger.exception("[AI Embeddings] Exception occurred while generating embedding.")
        return None
