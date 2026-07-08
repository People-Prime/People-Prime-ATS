import random
import string
import logging
from rest_framework import viewsets, status, generics, permissions

logger = logging.getLogger(__name__)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.conf import settings
from users.models import User, Role
from users.serializers import (
    UserSerializer, UserCreateSerializer, CustomTokenObtainPairSerializer,
    ChangePasswordSerializer, AdminResetPasswordSerializer, ForgotPasswordSerializer
)
from users.permissions import IsAdmin, IsManagerOrAbove

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class ChangePasswordView(generics.UpdateAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        
        if not user.check_password(serializer.data.get("old_password")):
            return Response({"old_password": ["Wrong password."]}, status=status.HTTP_400_BAD_REQUEST)
        
        user.set_password(serializer.data.get("new_password"))
        user.must_change_password = False
        user.save()
        return Response({"status": "Password updated successfully."}, status=status.HTTP_200_OK)

class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        
        try:
            user = User.objects.get(email=email)
            # Create a mock reset token/link (in prod this would be a secure token/uuid)
            temp_pass = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
            user.set_password(temp_pass)
            user.must_change_password = True
            user.save()
            
            # Send notification email
            send_mail(
                'Password Reset Requested - People Prime ATS',
                f'Hello {user.full_name},\n\nWe received a request to reset your password. Your new temporary password is: {temp_pass}\n\nPlease sign in using this password and update it immediately.',
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            return Response({"status": "Reset temporary password sent to your email."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            # We return 200 to prevent user enumeration attacks
            return Response({"status": "Reset email sent if the account exists."}, status=status.HTTP_200_OK)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().prefetch_related('reporting_to', 'teams')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_value_regex = '[^/]+'
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.request.method not in permissions.SAFE_METHODS:
            if self.request.user.role == Role.REPORTING_TEAM:
                class Deny(permissions.BasePermission):
                    def has_permission(self, request, view):
                        return False
                self.permission_classes = [Deny]
            elif self.action in ['create', 'destroy', 'toggle_active', 'admin_reset_password']:
                self.permission_classes = [IsAdmin]
        return super().get_permissions()

    def perform_create(self, serializer):
        # Extract the admin-provided password before saving
        password = serializer.validated_data.pop('password')
        user = serializer.save()
        user.set_password(password)
        user.must_change_password = True
        user.save()

        # Send Welcome Email asynchronously with Celery
        try:
            from users.tasks import send_welcome_email_task
            send_welcome_email_task.delay(user.email, user.full_name, password)
            logger.info(f'[CELERY] Queued welcome email task for {user.email}')
        except Exception as e:
            logger.error(f'[CELERY] Failed to queue welcome email task for {user.email}: {e}')

    # Toggle active/deactive status
    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        user.is_active = not user.is_active
        user.save()
        return Response({
            "status": "User status modified",
            "is_active": user.is_active
        }, status=status.HTTP_200_OK)

    # Admin reset password override
    @action(detail=True, methods=['post'], url_path='admin-reset-password')
    def admin_reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = AdminResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user.set_password(serializer.validated_data['new_password'])
        user.must_change_password = True
        user.save()
        
        # Notify user
        send_mail(
            'Your Password Has Been Reset by Admin',
            f'Hello {user.full_name},\n\nAn administrator has reset your password.\n'
            f'Your new temporary password is: {serializer.validated_data["new_password"]}\n\n'
            f'Please sign in and change your password.',
            'admin@peopleprimeats.com',
            [user.email],
            fail_silently=False,
        )
        return Response({"status": "Password override completed and email notification sent."}, status=status.HTTP_200_OK)

    # Visual tree mapping of reporting hierarchy
    @action(detail=False, methods=['get'], url_path='hierarchy')
    def hierarchy(self, request):
        all_users = User.objects.filter(is_active=True).exclude(role=Role.REPORTING_TEAM).select_related('team')
        
        # Map managers to their report lists
        users_by_manager = {}
        for u in all_users:
            mgr_id = u.reporting_to_id
            if mgr_id:
                if mgr_id not in users_by_manager:
                    users_by_manager[mgr_id] = []
                users_by_manager[mgr_id].append(u)
        
        # Start hierarchy from CEO levels (users with no manager or CEO role)
        top_levels = all_users.filter(reporting_to__isnull=True)
        
        def build_tree(node):
            children = users_by_manager.get(node.email, [])
            return {
                'id': node.email,
                'email': node.email,
                'full_name': node.full_name,
                'role': node.role,
                'team': node.team.name if node.team else None,
                'reports': [build_tree(child) for child in children]
            }

        hierarchy_data = [build_tree(ceo) for ceo in top_levels]
        return Response(hierarchy_data, status=status.HTTP_200_OK)
