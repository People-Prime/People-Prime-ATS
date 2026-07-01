from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from users.views import CustomTokenObtainPairView, ChangePasswordView, ForgotPasswordView

urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
]
