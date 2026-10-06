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
    }
