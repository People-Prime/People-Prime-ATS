from rest_framework import permissions
from users.models import Role

class IsAdmin(permissions.BasePermission):
    """
    Allows access only to Admin (Superuser) accounts.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and (request.user.role == Role.ADMIN or request.user.is_superuser)

class IsCEO(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.CEO

class IsSeniorManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.SENIOR_MANAGER

class IsManagerOrAbove(permissions.BasePermission):
    """
    Allows access to CEO, Senior Manager, Junior Manager, or Admin.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in [Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.JUNIOR_MANAGER] or request.user.is_superuser

class IsLeadOrAbove(permissions.BasePermission):
    """
    Allows access to Team Leads, Sub Leads, and managers.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in [
            Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.JUNIOR_MANAGER, 
            Role.TEAM_LEAD, Role.SUB_LEAD
        ] or request.user.is_superuser

class IsAssociate(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [Role.ASSOCIATE_ANALYST, Role.SENIOR_ANALYST]
