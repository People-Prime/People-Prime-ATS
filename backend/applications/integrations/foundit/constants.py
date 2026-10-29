"""

Official Foundit API Contract Constants & Environment Accessors.

Contains ONLY confirmed Foundit endpoints, headers, and event constants.

"""

import os
import datetime



FOUNDIT_JOB_BOARD_NAME = "Foundit"



# Official Foundit API Endpoints

TOKEN_ENDPOINT = "https://recruiter.foundit.in/recruiter-ats/generate/api/token"

JOB_POSTING_ENDPOINT = "https://recruiter.foundit.in/edge-jp/api/jobposting/ats/jp"

APPLICATIONS_ENDPOINT = "https://recruiter.foundit.in/recruiter-ats/v1/job/applications"

WEBHOOK_REGISTER_ENDPOINT = "https://recruiter.foundit.in/recruiter-ats/v1/web-hook/register"



# Confirmed Headers & Webhook Events

HEADER_API_KEY = "x-api-key"

HEADER_SESSION_TOKEN = "x-session-token"

WEBHOOK_EVENT_NAME = "job.application.response.created"



# Rate Limit Constraints

MAX_REQUESTS_PER_MINUTE = 100

MAX_APPLICATIONS_PER_PAGE = 100



def get_foundit_credentials():

    return {

        "api_key": os.getenv("FOUNDIT_API_KEY", ""),

        "corp_id": os.getenv("FOUNDIT_CORP_ID", ""),

        "login_id": os.getenv("FOUNDIT_LOGIN_ID", ""),

        "username": os.getenv("FOUNDIT_USERNAME", ""),

        "password": os.getenv("FOUNDIT_PASSWORD", ""),

        "channel_id": os.getenv("FOUNDIT_CHANNEL_ID", ""),

        "sub_channel_id": os.getenv("FOUNDIT_SUB_CHANNEL_ID", ""),

        "webhook_secret": os.getenv("FOUNDIT_WEBHOOK_SECRET", ""),

        "recruiter_id": os.getenv("FOUNDIT_RECRUITER_ID", "1220898"),

        "company_name": os.getenv("FOUNDIT_COMPANY_NAME", "People Prime Worldwide"),

        "owner_name": os.getenv("FOUNDIT_OWNER_NAME", ""),

        "owner_email": os.getenv("FOUNDIT_OWNER_EMAIL", ""),

        "min_salary": os.getenv("FOUNDIT_DEFAULT_MIN_SALARY", ""),

        "max_salary": os.getenv("FOUNDIT_DEFAULT_MAX_SALARY", ""),

        "currency_id": os.getenv("FOUNDIT_DEFAULT_CURRENCY_ID", "1"),

        "salary_confidential": os.getenv("FOUNDIT_DEFAULT_SALARY_CONFIDENTIAL", "1"),

        "industry_id": os.getenv("FOUNDIT_DEFAULT_INDUSTRY_ID", ""),

        "industry_name": os.getenv("FOUNDIT_DEFAULT_INDUSTRY_NAME", ""),

        "role_id": os.getenv("FOUNDIT_DEFAULT_ROLE_ID", ""),

        "role_name": os.getenv("FOUNDIT_DEFAULT_ROLE_NAME", ""),

        "function_name": os.getenv("FOUNDIT_DEFAULT_FUNCTION_NAME", "IT"),

        "location_id": os.getenv("FOUNDIT_DEFAULT_LOCATION_ID", ""),

        "location_name": os.getenv("FOUNDIT_DEFAULT_LOCATION_NAME", ""),

        "network_role_id": os.getenv("FOUNDIT_NETWORK_ROLE_ID", "1473"),

        "network_role_name": os.getenv("FOUNDIT_NETWORK_ROLE_NAME", "Network Engineer"),

        "network_industry_id": os.getenv("FOUNDIT_NETWORK_INDUSTRY_ID", "140"),

        "network_industry_name": os.getenv("FOUNDIT_NETWORK_INDUSTRY_NAME", "Consumer Software"),

    }





def is_foundit_live_applications_enabled():

    """

    Returns True if live Foundit application retrieval is explicitly enabled via environment configuration.

    Defaults to False for production safety.

    """

    return os.getenv("FOUNDIT_LIVE_APPLICATIONS_ENABLED", "False").lower() in ("true", "1")





def is_foundit_webhook_processing_enabled():

    """

    Returns True only when inbound Foundit webhook processing is explicitly enabled.

    Defaults to False for production safety.

    """

    return os.getenv("FOUNDIT_WEBHOOK_PROCESSING_ENABLED", "false").strip().lower() in ("true", "1")


MANDATORY_FUTURE_ONLY_FOLDER_IDS = frozenset({"156278847"})
DEFAULT_FUTURE_ONLY_FOLDER_IDS = MANDATORY_FUTURE_ONLY_FOLDER_IDS


def get_foundit_future_only_folder_ids():
    """
    Returns the set of Foundit folder IDs subject to the future-only synchronization safeguard.
    Mandatory folder 156278847 is always included and cannot be excluded through environment configuration.
    Any folders specified in FOUNDIT_FUTURE_ONLY_FOLDER_IDS are treated as additional protected folders.
    """
    protected_ids = set(MANDATORY_FUTURE_ONLY_FOLDER_IDS)
    env_ids = os.getenv("FOUNDIT_FUTURE_ONLY_FOLDER_IDS", "").strip()
    if env_ids:
        additional_ids = {item.strip() for item in env_ids.split(",") if item.strip()}
        protected_ids.update(additional_ids)
    return protected_ids


def is_folder_future_only_protected(folder_id):
    """
    Checks if a given folder_id is protected by the future-only synchronization safeguard.
    """
    if not folder_id:
        return False
    return str(folder_id).strip() in get_foundit_future_only_folder_ids()


def parse_utc_iso_datetime(dt_or_str):
    """
    Parses a string or datetime into a timezone-aware UTC datetime.
    Rejects timezone-naive datetimes, dates without time/tz, and invalid strings by returning None.
    """
    if not dt_or_str:
        return None
    if isinstance(dt_or_str, datetime.datetime):
        from django.utils import timezone
        if timezone.is_naive(dt_or_str):
            return None
        return dt_or_str.astimezone(datetime.timezone.utc)
    if isinstance(dt_or_str, datetime.date) and not isinstance(dt_or_str, datetime.datetime):
        return None
    if isinstance(dt_or_str, str):
        val = dt_or_str.strip()
        if not val:
            return None
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone
        parsed = parse_datetime(val)
        if parsed is None or timezone.is_naive(parsed):
            return None
        return parsed.astimezone(datetime.timezone.utc)
    return None


def get_foundit_activation_cutoff_utc(folder_id=None):
    """
    Retrieves and parses the UTC activation cutoff timestamp for a given folder or default.
    Checks FOUNDIT_APPLICATIONS_MIN_DATE_UTC_<folder_id> first, then FOUNDIT_APPLICATIONS_MIN_DATE_UTC.
    Returns timezone-aware datetime in UTC or None if unset/invalid/naive.
    """
    val = None
    if folder_id:
        clean_folder = str(folder_id).strip()
        val = os.getenv(f"FOUNDIT_APPLICATIONS_MIN_DATE_UTC_{clean_folder}", "").strip()
    if not val:
        val = os.getenv("FOUNDIT_APPLICATIONS_MIN_DATE_UTC", "").strip()
    if not val:
        return None
    return parse_utc_iso_datetime(val)
