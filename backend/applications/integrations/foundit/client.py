"""
Foundit API Client Foundation (Phase 3B).
Handles communication structure for Foundit APIs using official endpoints and headers.
Includes FounditContractUnverifiedException safety guard to prevent live production HTTP calls
for un-authorized endpoints (application retrieval, webhook registration, job update, job expiry).
"""
import logging
import requests
from applications.integrations.foundit.constants import (
    TOKEN_ENDPOINT,
    JOB_POSTING_ENDPOINT,
    APPLICATIONS_ENDPOINT,
    WEBHOOK_REGISTER_ENDPOINT,
    HEADER_API_KEY,
    HEADER_SESSION_TOKEN,
    MAX_APPLICATIONS_PER_PAGE,
    get_foundit_credentials,
)

logger = logging.getLogger(__name__)

class FounditContractUnverifiedException(Exception):
    """Raised when an unauthorized external API call (applications, webhooks, update, expire) is executed prior to its phase authorization."""
    pass

class FounditAPIError(Exception):
    """Raised when Foundit API returns an HTTP error or error response."""
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code

class FounditTimeoutError(FounditAPIError):
    """Raised when Foundit API request times out."""
    pass

class FounditValidationError(Exception):
    """Raised when ATS job metadata fails validation before sending to Foundit."""
    pass

class FounditClient:
    def __init__(self, transport=None):
        self.credentials = get_foundit_credentials()
        self.transport = transport  # Injection point for mock transport in unit tests
        self.live_job_posting_enabled = True       # Enabled in Phase 3B
        self.live_applications_enabled = False     # Remains False in Phase 3B
        self.live_webhook_enabled = False          # Remains False in Phase 3B

    def assert_job_posting_authorized(self):
        if not self.live_job_posting_enabled and not self.transport:
            logger.warning("[FounditClient] Job Posting API call blocked by Safety Guard.")
            raise FounditContractUnverifiedException(
                "Phase Safety Guard: Foundit Job Posting API execution is blocked."
            )

    def assert_job_update_authorized(self):
        if not self.transport:
            logger.warning("[FounditClient] Job Update API call blocked by Phase 3B Safety Guard.")
            raise FounditContractUnverifiedException(
                "Phase 3B Guard: Foundit Job Update API execution is blocked. "
                "Job update is out of scope in Phase 3B."
            )

    def assert_job_expiry_authorized(self):
        if not self.transport:
            logger.warning("[FounditClient] Job Expiry API call blocked by Phase 3B Safety Guard.")
            raise FounditContractUnverifiedException(
                "Phase 3B Guard: Foundit Job Expiry API execution is blocked. "
                "Job expiry is out of scope in Phase 3B."
            )

    def assert_applications_authorized(self):
        if not self.live_applications_enabled and not self.transport:
            logger.warning("[FounditClient] Application Retrieval API call blocked by Phase 3B Safety Guard.")
            raise FounditContractUnverifiedException(
                "Phase 3B Guard: Foundit Application GET API execution is blocked. "
                "Application retrieval authorization occurs in Phase 4."
            )

    def assert_webhook_authorized(self):
        if not self.live_webhook_enabled and not self.transport:
            logger.warning("[FounditClient] Webhook Registration API call blocked by Phase 3B Safety Guard.")
            raise FounditContractUnverifiedException(
                "Phase 3B Guard: Foundit Webhook Registration API execution is blocked. "
                "Webhook registration authorization occurs in Phase 4."
            )

    def generate_session_token(self, force_refresh=False):
        """
        POST https://recruiter.foundit.in/recruiter-ats/generate/api/token
        Authorized in Phase 3A.
        """
        from applications.integrations.foundit.auth import FounditAuthService
        auth_service = FounditAuthService(transport=self.transport)
        return auth_service.get_session_token(force_refresh=force_refresh)

    @staticmethod
    def extract_error_message(response_obj, default_msg="Invalid request parameters."):
        """
        Safely extracts detailed, sanitized error messages from Foundit API HTTP responses.
        Accepts a requests.Response object, parsed response dictionary/list, or raw string.
        Inspects fields: message, error, errors, details, description.
        Formats nested validation errors cleanly without exposing credentials or secrets.
        """
        data = None
        raw_text = ""

        if isinstance(response_obj, (dict, list)):
            data = response_obj
        elif hasattr(response_obj, "json"):
            try:
                data = response_obj.json()
            except Exception:
                data = None
            if hasattr(response_obj, "text"):
                raw_text = getattr(response_obj, "text", "") or ""
        elif isinstance(response_obj, str):
            raw_text = response_obj

        if isinstance(data, dict):
            # 1. Check nested structured error arrays (e.g. "errors", "details")
            structured_errors = data.get("errors") or data.get("details")
            if isinstance(structured_errors, list) and structured_errors:
                formatted_items = []
                for item in structured_errors:
                    if isinstance(item, dict):
                        field = item.get("field") or item.get("param") or item.get("key")
                        msg = item.get("message") or item.get("error") or item.get("msg") or str(item)
                        if field:
                            formatted_items.append(f"Field '{field}': {msg}")
                        else:
                            formatted_items.append(str(msg))
                    else:
                        formatted_items.append(str(item))
                if formatted_items:
                    return "; ".join(formatted_items)

            # 2. Check top-level string message fields
            msg = data.get("message") or data.get("error") or data.get("description") or data.get("errorMessage")
            if msg and isinstance(msg, str):
                return msg

            # 3. Fallback to sanitized JSON string if object has unknown structure
            if data:
                try:
                    import json
                    return json.dumps(data)
                except Exception:
                    return str(data)

        # 4. Fallback to raw text for non-JSON 400 response
        if raw_text and raw_text.strip():
            return raw_text.strip()[:500]

        return default_msg

    def post_job(self, payload):
        """
        POST https://recruiter.foundit.in/edge-jp/api/jobposting/ats/jp
        Authorized in Phase 3B.
        """
        self.assert_job_posting_authorized()
        if self.transport:
            return self.transport.post(JOB_POSTING_ENDPOINT, json=payload)

        session_token = self.generate_session_token()
        headers = {
            HEADER_API_KEY: self.credentials["api_key"],
            HEADER_SESSION_TOKEN: session_token,
            "Content-Type": "application/json"
        }

        try:
            res = requests.post(JOB_POSTING_ENDPOINT, json=payload, headers=headers, timeout=15)
            status_code = res.status_code

            if status_code in (200, 201):
                try:
                    data = res.json()
                except Exception:
                    data = {}
                return data
            elif status_code == 400:
                err_msg = FounditClient.extract_error_message(res)
                raise FounditAPIError(f"Foundit API Bad Request (HTTP 400): {err_msg}", status_code=400)
            elif status_code in (401, 403):
                raise FounditAPIError(f"Foundit API Authentication/Authorization failure (HTTP {status_code}).", status_code=status_code)
            elif status_code == 429:
                raise FounditAPIError("Foundit API rate limit exceeded (HTTP 429). Please retry later.", status_code=429)
            elif status_code >= 500:
                raise FounditAPIError(f"Foundit API server error (HTTP {status_code}).", status_code=status_code)
            else:
                raise FounditAPIError(f"Foundit API returned unexpected status HTTP {status_code}.", status_code=status_code)

        except requests.exceptions.Timeout:
            raise FounditTimeoutError("Foundit API request timed out after 15 seconds. Reconciliation required before retry.", status_code=408)
        except requests.exceptions.RequestException as e:
            raise FounditAPIError(f"Foundit API network request failed: {e.__class__.__name__}")

    def update_job(self, folder_id, payload):
        """
        POST https://recruiter.foundit.in/edge-jp/api/jobposting/ats/jp
        BLOCKED in Phase 3B.
        """
        self.assert_job_update_authorized()
        if self.transport:
            return self.transport.post(JOB_POSTING_ENDPOINT, json=payload)
        return {"folderId": folder_id, "status": "save"}

    def expire_job(self, folder_id):
        """
        POST https://recruiter.foundit.in/edge-jp/api/jobposting/ats/jp
        BLOCKED in Phase 3B.
        """
        self.assert_job_expiry_authorized()
        if self.transport:
            return self.transport.post(JOB_POSTING_ENDPOINT, json={"folderId": folder_id, "status": "expire"})
        return {"folderId": folder_id, "status": "expire"}

    def get_applications(self, folder_id, page_number=1, limit=MAX_APPLICATIONS_PER_PAGE, applications_since=None):
        """
        GET https://recruiter.foundit.in/recruiter-ats/v1/job/applications
        Authorized in Phase 4.
        """
        self.assert_applications_authorized()

        safe_limit = min(int(limit) if limit else MAX_APPLICATIONS_PER_PAGE, MAX_APPLICATIONS_PER_PAGE)
        if safe_limit < 1:
            safe_limit = 1

        params = {
            "folder_id": str(folder_id),
            "corp_id": self.credentials.get("corp_id", ""),
            "login_id": self.credentials.get("login_id", ""),
            "channel_id": self.credentials.get("channel_id", ""),
            "sub_channel_id": self.credentials.get("sub_channel_id", ""),
            "limit": safe_limit,
            "page_number": int(page_number) if page_number else 1,
        }
        if applications_since:
            params["applications_since"] = applications_since

        if self.transport:
            return self.transport.get(APPLICATIONS_ENDPOINT, params=params)

        session_token = self.generate_session_token()
        headers = {
            HEADER_API_KEY: self.credentials.get("api_key", ""),
            HEADER_SESSION_TOKEN: session_token,
        }

        try:
            res = requests.get(APPLICATIONS_ENDPOINT, headers=headers, params=params, timeout=15)
            status_code = res.status_code

            if status_code in (200, 201):
                try:
                    return res.json()
                except Exception:
                    return {}
            elif status_code == 400:
                err_msg = FounditClient.extract_error_message(res)
                raise FounditAPIError(f"Foundit API Bad Request (HTTP 400): {err_msg}", status_code=400)
            elif status_code in (401, 403):
                raise FounditAPIError(f"Foundit API Authentication/Authorization failure (HTTP {status_code}).", status_code=status_code)
            elif status_code == 404:
                err_msg = FounditClient.extract_error_message(res, default_msg="Applications or folder not found.")
                raise FounditAPIError(f"Foundit API Not Found (HTTP 404): {err_msg}", status_code=404)
            elif status_code == 429:
                raise FounditAPIError("Foundit API rate limit exceeded (HTTP 429). Please retry later.", status_code=429)
            elif status_code >= 500:
                raise FounditAPIError(f"Foundit API server error (HTTP {status_code}).", status_code=status_code)
            else:
                raise FounditAPIError(f"Foundit API returned unexpected status HTTP {status_code}.", status_code=status_code)

        except requests.exceptions.Timeout:
            raise FounditTimeoutError("Foundit Applications API request timed out after 15 seconds.", status_code=408)
        except requests.exceptions.RequestException as e:
            raise FounditAPIError(f"Foundit Applications API network request failed: {e.__class__.__name__}")

    def register_webhook(self, callback_url):
        """
        POST https://recruiter.foundit.in/recruiter-ats/v1/web-hook/register
        BLOCKED in Phase 3B.
        """
        self.assert_webhook_authorized()
        if self.transport:
            payload = {
                "channelId": self.credentials["channel_id"],
                "subChannelId": self.credentials["sub_channel_id"],
                "corpId": self.credentials["corp_id"],
                "url": callback_url,
                "events": ["job.application.response.created"],
                "secret": self.credentials["webhook_secret"],
                "login_id": self.credentials["login_id"]
            }
            return self.transport.post(WEBHOOK_REGISTER_ENDPOINT, json=payload)
        return {"status": "SUCCESS"}

