from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from users.models import User, Role
from teams.models import Team

class TeamMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name']

class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'full_name', 'role']

class UserSerializer(serializers.ModelSerializer):
    reporting_to = UserMinimalSerializer(many=True, read_only=True)
    teams = TeamMinimalSerializer(many=True, read_only=True)
    reporting_to_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='reporting_to', many=True, write_only=True, required=False
    )
    team_ids = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source='teams', many=True, write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            'email', 'full_name', 'role', 'reporting_to', 'teams',
            'reporting_to_ids', 'team_ids', 'date_of_joining',
            'must_change_password', 'is_active'
        ]
        read_only_fields = ['must_change_password']

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    reporting_to_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='reporting_to', many=True, write_only=True, required=False
    )
    team_ids = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source='teams', many=True, write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            'email', 'full_name', 'role', 'password', 'reporting_to_ids', 'team_ids', 'date_of_joining'
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An employee account with this email already exists.")
        return value

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims for React client to decrypt
        token['full_name'] = user.full_name
        token['email'] = user.email
        token['role'] = user.role
        token['must_change_password'] = user.must_change_password
        return token

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6)

class AdminResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(required=True, min_length=6)

class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
