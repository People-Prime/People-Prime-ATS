"""

Isolated Foundit Public Webhook & Integration API Views.

Receives candidate application webhooks (event: job.application.response.created) from Foundit

with zero side-effects on LinkedIn or public ATS views.

"""

import hmac

import logging

from django.conf import settings

from rest_framework.views import APIView

from rest_framework.response import Response

from rest_framework import permissions, status

from applications.integrations.foundit.candidate_ingestion import FounditCandidateIngestionService

from applications.integrations.foundit.constants import get_foundit_credentials, WEBHOOK_EVENT_NAME, is_foundit_webhook_processing_enabled



logger = logging.getLogger(__name__)



class FounditCandidateWebhookView(APIView):

    permission_classes = [permissions.AllowAny]



    def post(self, request, *args, **kwargs):

        # 1. Signature / Secret Check

        credentials = get_foundit_credentials()

        secret = credentials.get("webhook_secret")

        if secret and str(secret).strip():

            auth_header = request.headers.get("x-api-key") or request.headers.get("X-Foundit-Signature")

            if not auth_header or not str(auth_header).strip():

                logger.warning("[FounditWebhookView] Unauthorized webhook call - missing authentication header.")

                return Response(

                    {"success": False, "error": "Unauthorized: missing webhook authentication header."},

                    status=status.HTTP_401_UNAUTHORIZED

                )

            if not hmac.compare_digest(str(auth_header).strip(), str(secret).strip()):

                logger.warning("[FounditWebhookView] Unauthorized webhook call - secret mismatch.")

                return Response(

                    {"success": False, "error": "Unauthorized: invalid webhook signature or secret."},

                    status=status.HTTP_401_UNAUTHORIZED

                )

        else:

            if not getattr(settings, 'DEBUG', False):

                logger.error(

                    "[FounditWebhookView] Webhook secret is not configured in production (FOUNDIT_WEBHOOK_SECRET is empty). "

                    "Rejecting unauthenticated webhook request."

                )

                return Response(

                    {"success": False, "error": "Unauthorized: webhook endpoint not configured."},

                    status=status.HTTP_401_UNAUTHORIZED

                )

            logger.warning(

                "[FounditWebhookView] Webhook secret is not configured in environment (FOUNDIT_WEBHOOK_SECRET is empty). "

                "Endpoint is operating without authentication in development mode (DEBUG=True). "

                "Configure FOUNDIT_WEBHOOK_SECRET to enforce security in production."

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



        if not is_foundit_webhook_processing_enabled():

            logger.warning(

                "[FounditWebhookView] Valid webhook received while inbound processing is disabled."

            )

            return Response(

                {

                    "success": False,

                    "code": "FOUNDIT_WEBHOOK_PROCESSING_DISABLED",

                    "error": "Foundit webhook processing is disabled.",

                },

                status=status.HTTP_503_SERVICE_UNAVAILABLE,

            )



        result = FounditCandidateIngestionService.ingest_candidate(payload)



        if not result.get("success"):

            return Response(result, status=status.HTTP_422_UNPROCESSABLE_ENTITY)



        if result.get("duplicate"):

            return Response(result, status=status.HTTP_200_OK)



        return Response(result, status=status.HTTP_201_CREATED)
