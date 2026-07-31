from django.urls import path, include
from rest_framework.routers import DefaultRouter
from applications.views import ApplicationViewSet, CareerPortalApplicantViewSet

router = DefaultRouter()
router.register('career-portal-applicants', CareerPortalApplicantViewSet, basename='career-portal-applicant')
router.register('', ApplicationViewSet, basename='application')

urlpatterns = [
    path('', include(router.urls)),
]
