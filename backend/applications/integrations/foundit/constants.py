"""
Official Foundit API Contract Constants & Environment Accessors.
Contains ONLY confirmed Foundit endpoints, headers, and event constants.
"""
import os

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
    }
