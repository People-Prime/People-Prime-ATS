from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from applications.models import Application
from applications.serializers import PublicJobSerializer, PublicJobApplySerializer


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


class PublicJobApplyAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, job_id=None):
        # 1. Verify Job
        job = Application.objects.filter(
            id=job_id,
            candidate_name='',
            publish_to_career_page=True
        ).exclude(
            status__iexact='Closed'
        ).first()

        if not job:
            return Response({
                "success": False,
                "errors": {
                    "job_id": ["Published job posting not found or is no longer active."]
                }
            }, status=status.HTTP_404_NOT_FOUND)

        # 2. Validate Data
        serializer = PublicJobApplySerializer(data=request.data)
        if not serializer.is_valid():
            print(f"[Public Job Apply 400 Error] Validation failed for job_id={job_id}: {serializer.errors}")
            return Response({
                "success": False,
                "errors": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # 3. Resume Upload (reuse ATS S3 upload logic)
        resume_file = data['resume']
        resume_link = ''
        filename = resume_file.name

        try:
            import os
            import boto3

            bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage')
            region = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
            access_key = os.getenv('AWS_ACCESS_KEY_ID')
            secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')

            if access_key and secret_key:
                s3_client = boto3.client(
                    's3',
                    region_name=region,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key
                )
                content_type = 'application/octet-stream'
                if filename.lower().endswith('.pdf'):
                    content_type = 'application/pdf'
                elif filename.lower().endswith('.docx'):
                    content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                elif filename.lower().endswith('.doc'):
                    content_type = 'application/msword'

                s3_client.upload_fileobj(
                    resume_file,
                    bucket_name,
                    filename,
                    ExtraArgs={'ContentType': content_type}
                )
                resume_link = f"s3://{bucket_name}/{filename}"
            else:
                resume_link = filename
        except Exception as e:
            # Fallback to filename if S3 fails
            resume_link = filename

        # 4. Save Candidate ONLY in CareerPortalApplicant (DO NOT create ATS Application!)
        from applications.models import CareerPortalApplicant
        applicant = CareerPortalApplicant.objects.create(
            job=job,
            first_name=data['first_name'],
            last_name=data['last_name'],
            mobile_number=data['mobile_number'],
            alternate_mobile_number=data.get('alternate_mobile_number', ''),
            email=data['email'],
            qualification=data['qualification'],
            years_of_experience=data['years_of_experience'],
            expected_pay=data['expected_pay'],
            primary_skills=data['primary_skills'],
            current_ctc=data['current_ctc'],
            current_company=data['current_company'],
            state=data['state'],
            city=data['city'],
            resume=resume_link,
            accepted_terms=True,
            source='Company Career Portal',
            status='New'
        )

        # 5. Trigger AI Shortlisting in Celery Background Task (non-blocking)
        try:
            from applications.ai.tasks import score_applicant_resume_task
            score_applicant_resume_task.delay(applicant.id)
        except Exception as e:
            print(f"[Public Job Apply View] Non-blocking exception triggering AI task: {e}")

        return Response({
            "success": True,
            "message": "Application submitted successfully."
        }, status=status.HTTP_201_CREATED)

