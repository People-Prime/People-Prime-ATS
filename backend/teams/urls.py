from django.urls import path, include
from rest_framework.routers import DefaultRouter
from teams.views import TeamViewSet

router = DefaultRouter()
router.register('', TeamViewSet, basename='team')

urlpatterns = [
    path('', include(router.urls)),
]
