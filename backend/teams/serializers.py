from rest_framework import serializers
from teams.models import Team
from users.serializers import UserMinimalSerializer
from users.models import User

class TeamSerializer(serializers.ModelSerializer):
    team_lead = UserMinimalSerializer(read_only=True)
    team_lead_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='team_lead', write_only=True, required=False, allow_null=True
    )
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ['id', 'name', 'description', 'team_lead', 'team_lead_id', 'members_count']

    def get_members_count(self, obj):
        # Calculates number of active employees on this team
        return obj.members.filter(is_active=True).count()

class TeamCreateSerializer(serializers.ModelSerializer):
    team_lead_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='team_lead', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Team
        fields = ['id', 'name', 'description', 'team_lead_id']
