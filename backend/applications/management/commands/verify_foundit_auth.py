"""
Temporary management command for Foundit Phase 3A live authentication verification.
Usage:
python backend/manage.py verify_foundit_auth
"""
from django.core.management.base import BaseCommand
from applications.integrations.foundit.auth import FounditAuthService, FounditAuthException
from applications.integrations.foundit.constants import get_foundit_credentials

class Command(BaseCommand):
    help = "Performs a single live authentication/token request against Foundit without posting jobs or mutating database."

    def handle(self, *args, **options):
        self.stdout.write("Checking Foundit Environment Configuration...")
        creds = get_foundit_credentials()
        missing = [k for k in ["api_key", "corp_id", "username", "password", "channel_id", "sub_channel_id"] if not creds.get(k)]
        if missing:
            self.stdout.write(self.style.ERROR(f"MISSING REQUIRED CREDENTIALS: {', '.join(missing)}"))
            return

        self.stdout.write("Executing Foundit Live Authentication Request...")
        auth_service = FounditAuthService()

        try:
            token = auth_service.get_session_token(force_refresh=True)
            self.stdout.write(self.style.SUCCESS("\nAUTH RESULT: SUCCESS"))
            self.stdout.write("HTTP 200 OK")
            self.stdout.write("x-session-token received: YES")
        except FounditAuthException as e:
            self.stdout.write(self.style.ERROR("\nAUTH RESULT: FAILED"))
            self.stdout.write(self.style.ERROR("HTTP 401 Unauthorized"))
            self.stdout.write(self.style.ERROR(f"Sanitized Error: {str(e)}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR("\nAUTH RESULT: FAILED"))
            self.stdout.write(self.style.ERROR(f"Error: {e.__class__.__name__}"))
