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

        req_source = request.data.get('source') or request.query_params.get('source') or request.query_params.get('src') or 'Company Career Portal'
        if req_source and 'linkedin' in str(req_source).lower():
            resolved_source = 'LinkedIn'
        else:
            resolved_source = 'Company Career Portal'

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
            source=resolved_source,
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


class PublicLinkedInJobXmlFeedAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        import re
        from django.http import HttpResponse
        from django.utils.html import escape
        from django.utils.feedgenerator import rfc2822_date

        def extract_field(remarks, field_name):
            if not remarks:
                return ''
            match = re.search(r'' + field_name + r':\s*(.*)', remarks)
            if match:
                val = match.group(1).strip()
                return val if val and val != 'N/A' else ''
            return ''

        def extract_skills(remarks):
            if not remarks:
                return ''
            skills = []
            seen_lower = set()

            def add_skill(s):
                item = s.strip()
                if item and item.lower() not in seen_lower:
                    seen_lower.add(item.lower())
                    skills.append(item)

            if 'Technical Proficiency:' in remarks:
                after_prof = remarks.split('Technical Proficiency:', 1)[1]
                lines = after_prof.split('\n')
                stop_header = re.compile(r'^\s*\[.+\]')
                stop_key = re.compile(
                    r'^\s*(Notice Period|Required Documents|Source Option|FileName|Job Code|Client Bill Rate|Pay Rate|Start Date|End Date|Location|Job Status|Job Type|Client Job ID|Address|Work Mode|Employee Type|Zip Code|Degree):\s*',
                    re.IGNORECASE
                )
                for line in lines:
                    if stop_header.match(line) or stop_key.match(line):
                        break
                    parts = re.split(r'[,;|\u2022\u25cf/]+', line)
                    for p in parts:
                        add_skill(p)

            if not skills and 'Skills:' in remarks:
                match = re.search(r'Skills:\s*(.*)', remarks, re.IGNORECASE)
                if match:
                    parts = re.split(r'[,;|\u2022\u25cf/]+', match.group(1))
                    for p in parts:
                        add_skill(p)

            return ', '.join(skills)

        def extract_description(remarks):
            if not remarks:
                return ''
            desc = ''
            if '[Skills & Assignment]' in remarks:
                parts = remarks.split('[Skills & Assignment]', 1)
                after = parts[1]
                if '[Notice Period]' in after:
                    desc = after.split('[Notice Period]', 1)[0]
                elif '[' in after:
                    desc = after.split('[', 1)[0]
                else:
                    desc = after
            elif 'Description:' in remarks:
                desc = remarks.split('Description:', 1)[1]

            cleaned_lines = []
            for line in desc.split('\n'):
                if re.match(r'^\s*(Degree|Description|Primary Skills):\s*', line, re.IGNORECASE):
                    continue
                cleaned_lines.append(line)

            result = '\n'.join(cleaned_lines).strip()
            return result if result else remarks.strip()

        qs = Application.objects.filter(
            candidate_name='',
            publish_to_linkedin=True,
            publish_to_career_page=True
        ).exclude(
            status__iexact='Closed'
        ).only(
            'id', 'position', 'client_name', 'city', 'state', 'country',
            'technology', 'experience', 'remarks', 'published_at', 'created_at'
        ).order_by('id')

        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<source>',
            '  <publisher>People Prime Worldwide</publisher>',
            '  <publisherurl>https://people-prime.com</publisherurl>'
        ]

        seen_job_codes = set()

        for job in qs:
            remarks = job.remarks or ''
            job_code = extract_field(remarks, 'Job Code') or f"PPW - {job.id:04d}"

            if job_code in seen_job_codes:
                continue
            seen_job_codes.add(job_code)

            location = extract_field(remarks, 'Location')
            job_type = extract_field(remarks, 'Job Type')
            work_mode = extract_field(remarks, 'Work Mode')
            salary = extract_field(remarks, 'Pay Rate') or extract_field(remarks, 'Client Bill Rate')
            city = (job.city or extract_field(remarks, 'City') or location or '').strip()
            state = (job.state or extract_field(remarks, 'State') or '').strip()
            country = (job.country or extract_field(remarks, 'Country') or 'India').strip()

            # Include job only when city, state, and country are all non-empty
            if not city or not state or not country:
                continue

            skills_str = extract_skills(remarks) or (job.technology or '')
            description_text = extract_description(remarks)

            pub_dt = job.published_at or job.created_at
            pub_date_str = rfc2822_date(pub_dt) if pub_dt else ''

            apply_url = f"https://people-prime.com/job-details?id={job.id}&src=LinkedIn"

            xml_lines.append('  <job>')
            xml_lines.append(f'    <id>{job.id}</id>')
            xml_lines.append(f'    <jobcode>{escape(job_code)}</jobcode>')
            xml_lines.append(f'    <title>{escape(job.position or "")}</title>')
            xml_lines.append(f'    <company>People Prime Worldwide</company>')
            xml_lines.append(f'    <city>{escape(city)}</city>')
            xml_lines.append(f'    <state>{escape(state)}</state>')
            xml_lines.append(f'    <country>{escape(country)}</country>')
            xml_lines.append(f'    <employmenttype>{escape(job_type)}</employmenttype>')
            xml_lines.append(f'    <workplacetype>{escape(work_mode)}</workplacetype>')
            xml_lines.append(f'    <technology>{escape(job.technology or "")}</technology>')
            xml_lines.append(f'    <experience>{escape(str(job.experience or ""))}</experience>')
            xml_lines.append(f'    <salary>{escape(salary)}</salary>')
            xml_lines.append(f'    <description><![CDATA[{description_text}]]></description>')
            xml_lines.append(f'    <skills>{escape(skills_str)}</skills>')
            xml_lines.append(f'    <date>{escape(pub_date_str)}</date>')
            xml_lines.append(f'    <url>{escape(apply_url)}</url>')
            xml_lines.append('  </job>')

        xml_lines.append('</source>')

        response = HttpResponse('\n'.join(xml_lines), content_type='application/xml; charset=utf-8')
        return response

