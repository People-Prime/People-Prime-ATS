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
    member_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = Team
        fields = ['id', 'name', 'description', 'team_lead', 'team_lead_id', 'members_count', 'member_ids']

    def get_members_count(self, obj):
        # Calculates number of active employees on this team
        return obj.members.filter(is_active=True).count()

    def update(self, instance, validated_data):
        members_data = validated_data.pop('member_ids', None)
        team_lead = validated_data.get('team_lead', instance.team_lead)
        instance = super().update(instance, validated_data)
        if members_data is not None:
            if team_lead and team_lead not in members_data:
                members_data.append(team_lead)
            instance.members.set(members_data)
        return instance

class TeamCreateSerializer(serializers.ModelSerializer):
    team_lead_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='team_lead', write_only=True, required=False, allow_null=True
    )
    member_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = Team
        fields = ['id', 'name', 'description', 'team_lead_id', 'member_ids']

    def create(self, validated_data):
        members_data = validated_data.pop('member_ids', [])
        team_lead = validated_data.get('team_lead')
        team = super().create(validated_data)
        if team_lead and team_lead not in members_data:
            members_data.append(team_lead)
        team.members.set(members_data)
        return team

    def update(self, instance, validated_data):
        members_data = validated_data.pop('member_ids', None)
        team_lead = validated_data.get('team_lead', instance.team_lead)
        instance = super().update(instance, validated_data)
        if members_data is not None:
            if team_lead and team_lead not in members_data:
                members_data.append(team_lead)
            instance.members.set(members_data)
        return instance
