from django.urls import path
from applications.public_views import PublicJobListAPIView, PublicJobDetailAPIView, PublicJobApplyAPIView

urlpatterns = [
    path('', PublicJobListAPIView.as_view(), name='public-job-list'),
    path('<int:id>/', PublicJobDetailAPIView.as_view(), name='public-job-detail'),
    path('<int:job_id>/apply/', PublicJobApplyAPIView.as_view(), name='public-job-apply'),
]
