from django.urls import path
from django.views.decorators.cache import cache_page
from applications.public_views import (
    PublicJobListAPIView,
    PublicJobDetailAPIView,
    PublicJobApplyAPIView,
    PublicLinkedInJobXmlFeedAPIView
)

from applications.foundit_views import FounditCandidateWebhookView

urlpatterns = [
    path('', PublicJobListAPIView.as_view(), name='public-job-list'),
    path('linkedin/xml/', cache_page(60 * 15)(PublicLinkedInJobXmlFeedAPIView.as_view()), name='public-linkedin-xml-feed'),
    path('foundit/webhook/', FounditCandidateWebhookView.as_view(), name='public-foundit-webhook'),
    path('<int:id>/', PublicJobDetailAPIView.as_view(), name='public-job-detail'),
    path('<int:job_id>/apply/', PublicJobApplyAPIView.as_view(), name='public-job-apply'),
]

