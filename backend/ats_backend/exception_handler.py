import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler for Django REST Framework.

    DRF's default handler only catches DRF-specific exceptions (validation,
    permission, 404, etc.) and returns JSON. Any unhandled Python exception
    (DB errors, S3 failures, TypeErrors, etc.) falls through to Django's
    core handler, which returns an HTML error page when DEBUG=False.

    This handler catches those unhandled exceptions and returns a clean
    JSON response instead of HTML, so the frontend always gets parseable JSON.
    """
    # Let DRF handle its own exceptions first (validation, auth, 404, etc.)
    response = exception_handler(exc, context)

    if response is not None:
        return response

    # If DRF didn't handle it, it's an unhandled server error.
    # Log the full traceback for debugging, but return clean JSON to the client.
    view = context.get('view', None)
    view_name = view.__class__.__name__ if view else 'UnknownView'
    logger.exception(
        f"[Unhandled Exception] in {view_name}: {exc}"
    )

    return Response(
        {"detail": "An internal server error occurred. Please try again or contact the administrator."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
