"""
Foundit Authentication & Token Service (Phase 3A).
Manages session token generation via official endpoint:
POST https://recruiter.foundit.in/recruiter-ats/generate/api/token

Headers:
x-api-key: <FOUNDIT_API_KEY>
Content-Type: application/json

Body:
{
  "channelId": "...",
  "subChannelId": "...",
  "corpId": "...",
  "username": "...",
  "password": "..."
}
"""
import logging
import requests
from django.core.cache import cache
from applications.integrations.foundit.constants import (
    TOKEN_ENDPOINT,
    HEADER_API_KEY,
    HEADER_SESSION_TOKEN,
    get_foundit_credentials,
)

logger = logging.getLogger(__name__)

CACHE_KEY_SESSION_TOKEN = "foundit_session_token"
CACHE_TIMEOUT_SECONDS = 3300  # 55 minutes default TTL

class FounditAuthException(Exception):
    """Raised when Foundit authentication fails due to missing credentials, HTTP errors, or missing session token."""
    pass

class FounditAuthService:
    def __init__(self, transport=None):
        self.credentials = get_foundit_credentials()
        self.transport = transport  # Injection point for mock transport in unit tests

    def validate_configuration(self):
        """Validates that all mandatory credentials are provided before making request."""
        required_keys = ["api_key", "corp_id", "username", "password", "channel_id", "sub_channel_id"]
        missing = [k for k in required_keys if not self.credentials.get(k)]
        if missing:
            logger.error(f"[FounditAuthService] Missing mandatory credential configuration: {', '.join(missing)}")
            raise FounditAuthException(f"Foundit authentication failed: missing credentials ({', '.join(missing)})")

    def get_session_token(self, force_refresh=False):
        """
        Retrieves or refreshes x-session-token for authenticated ATS operations.
        Uses Django Redis/memory cache to avoid unnecessary token generation calls.
        """
        if not force_refresh:
            try:
                cached_token = cache.get(CACHE_KEY_SESSION_TOKEN)
                if cached_token:
                    logger.info("[FounditAuthService] Reusing valid cached Foundit session token.")
                    return cached_token
            except Exception as e:
                logger.warning(f"[FounditAuthService] Cache read unavailable ({e.__class__.__name__}), proceeding to token request.")

        # 1. Validate configuration
        self.validate_configuration()


        headers = {
            HEADER_API_KEY: self.credentials["api_key"],
            "Content-Type": "application/json"
        }

        payload = {
            "channelId": self.credentials["channel_id"],
            "subChannelId": self.credentials["sub_channel_id"],
            "corpId": self.credentials["corp_id"],
            "username": self.credentials["username"],
            "password": self.credentials["password"]
        }

        logger.info("[FounditAuthService] Foundit authentication started.")

        try:
            if self.transport:
                response_data, status_code = self.transport.request_token(TOKEN_ENDPOINT, headers=headers, json=payload)
            else:
                res = requests.post(TOKEN_ENDPOINT, headers=headers, json=payload, timeout=10)
                status_code = res.status_code
                try:
                    response_data = res.json()
                except Exception:
                    response_data = {}

            if status_code in (401, 403):
                logger.error(f"[FounditAuthService] Foundit authentication failed: HTTP {status_code} Unauthorized/Forbidden.")
                raise FounditAuthException(f"Foundit authentication failed with HTTP status {status_code} (Invalid credentials or API key).")
            elif status_code == 429:
                logger.error("[FounditAuthService] Foundit authentication failed: HTTP 429 Rate Limit Exceeded.")
                raise FounditAuthException("Foundit authentication rate limit exceeded (HTTP 429). Please retry later.")
            elif status_code >= 500:
                logger.error(f"[FounditAuthService] Foundit authentication failed: HTTP {status_code} Server Error.")
                raise FounditAuthException(f"Foundit authentication failed due to remote server error (HTTP {status_code}).")
            elif status_code not in (200, 201):
                logger.error(f"[FounditAuthService] Foundit authentication failed: HTTP {status_code}.")
                raise FounditAuthException(f"Foundit authentication failed with HTTP status {status_code}.")

            # Extract session token from response
            token = None
            if isinstance(response_data, dict):
                token = (
                    response_data.get(HEADER_SESSION_TOKEN) or
                    response_data.get("x-session-token") or
                    response_data.get("sessionToken") or
                    response_data.get("token") or
                    response_data.get("accessToken")
                )

            if not token:
                logger.error("[FounditAuthService] Foundit authentication failed: Session token missing in response.")
                raise FounditAuthException("Foundit authentication failed: Response did not contain a valid session token.")

            # Cache session token safely
            try:
                cache.set(CACHE_KEY_SESSION_TOKEN, token, timeout=CACHE_TIMEOUT_SECONDS)
            except Exception as e:
                logger.warning(f"[FounditAuthService] Cache write unavailable ({e.__class__.__name__}).")

            logger.info("[FounditAuthService] Foundit authentication succeeded.")
            return token

        except requests.exceptions.Timeout:
            logger.error("[FounditAuthService] Foundit authentication request timed out.")
            raise FounditAuthException("Foundit authentication request timed out after 10 seconds.")
        except requests.exceptions.RequestException as e:
            logger.error("[FounditAuthService] Foundit authentication network request failed.")
            raise FounditAuthException(f"Foundit authentication network request failed: {e.__class__.__name__}")

    def invalidate_token(self):
        """Invalidates cached session token."""
        try:
            cache.delete(CACHE_KEY_SESSION_TOKEN)
        except Exception:
            pass
        logger.info("[FounditAuthService] Cached Foundit session token invalidated.")

