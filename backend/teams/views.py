from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from teams.models import Team
from teams.serializers import TeamSerializer, TeamCreateSerializer
from users.serializers import UserSerializer
from users.permissions import IsManagerOrAbove

class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.all()
    serializer_class = TeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TeamCreateSerializer
        return TeamSerializer

    def get_permissions(self):
        # Create, Update, Delete restricted to Manager or above
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            self.permission_classes = [IsManagerOrAbove]
        return super().get_permissions()

    # Query all active employees assigned to this team
    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        team = self.get_object()
        members = team.members.filter(is_active=True)
        serializer = UserSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
