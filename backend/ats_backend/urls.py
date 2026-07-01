from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/auth/', include('users.auth_urls')),
    path('api/users/', include('users.urls')),
    path('api/teams/', include('teams.urls')),
    path('api/applications/', include('applications.urls')),
]
