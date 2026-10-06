"""
Isolated Foundit Public Webhook & Integration API Views.
Receives candidate application webhooks (event: job.application.response.created) from Foundit
with zero side-effects on LinkedIn or public ATS views.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from applications.integrations.foundit.candidate_ingestion import FounditCandidateIngestionService
from applications.integrations.foundit.constants import get_foundit_credentials, WEBHOOK_EVENT_NAME

logger = logging.getLogger(__name__)

class FounditCandidateWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        # 1. Signature / Secret Check
        credentials = get_foundit_credentials()
        secret = credentials.get("webhook_secret")
        if secret:
            auth_header = request.headers.get("x-api-key") or request.headers.get("X-Foundit-Signature")
            if auth_header and auth_header != secret:
                logger.warning("[FounditWebhookView] Unauthorized webhook call - secret mismatch.")
                return Response(
                    {"success": False, "error": "Unauthorized signature"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        payload = request.data
        if not isinstance(payload, dict):
            return Response(
                {"success": False, "error": "Invalid JSON payload format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        event = payload.get("event") or payload.get("eventName")
        if event and event != WEBHOOK_EVENT_NAME:
            logger.info(f"[FounditWebhookView] Ignored unhandled event: {event}")
            return Response({"success": True, "message": f"Event {event} ignored."}, status=status.HTTP_200_OK)

        result = FounditCandidateIngestionService.ingest_candidate(payload)

        if not result.get("success"):
            return Response(result, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        if result.get("duplicate"):
            return Response(result, status=status.HTTP_200_OK)

        return Response(result, status=status.HTTP_201_CREATED)
