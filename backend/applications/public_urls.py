from django.urls import path
from applications.public_views import PublicJobListAPIView, PublicJobDetailAPIView

urlpatterns = [
    path('', PublicJobListAPIView.as_view(), name='public-job-list'),
    path('<int:id>/', PublicJobDetailAPIView.as_view(), name='public-job-detail'),
]
