from rest_framework import generics, permissions
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from applications.models import Application
from applications.serializers import PublicJobSerializer


class PublicJobPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class PublicJobListAPIView(generics.ListAPIView):
    serializer_class = PublicJobSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = PublicJobPagination

    def get_queryset(self):
        qs = Application.objects.filter(
            candidate_name='',
            publish_to_career_page=True
        ).exclude(
            status__iexact='Closed'
        ).order_by('-published_at', '-created_at')

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(position__icontains=search) |
                Q(technology__icontains=search) |
                Q(city__icontains=search) |
                Q(state__icontains=search) |
                Q(client_name__icontains=search)
            )

        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city__icontains=city)

        technology = self.request.query_params.get('technology')
        if technology:
            qs = qs.filter(technology__icontains=technology)

        return qs


class PublicJobDetailAPIView(generics.RetrieveAPIView):
    serializer_class = PublicJobSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'id'

    def get_queryset(self):
        return Application.objects.filter(
            candidate_name='',
            publish_to_career_page=True
        ).exclude(
            status__iexact='Closed'
        )
