import csv
from django.http import HttpResponse
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Q
from applications.models import Application, Note
from applications.serializers import ApplicationSerializer, ApplicationCreateSerializer, NoteSerializer
from users.models import User, Role
from teams.models import Team


def check_and_send_assignment_email(application, request_user, is_new=False, old_assignee_email=None):
    if not application.candidate_name and application.assigned_employee:
        if is_new or old_assignee_email != application.assigned_employee.email:
            remarks = application.remarks or ''
            
            def extract_field(field_name):
                import re
                match = re.search(field_name + r':\s*(.*)', remarks)
                return match.group(1).strip() if match else 'N/A'

            job_code = extract_field('Job Code')
            if job_code == 'N/A' or not job_code or 'Auto Generated' in job_code:
                job_code = f"PPW - {application.id:04d}"
            
            start_date_str = extract_field('Start Date')
            end_date_str = extract_field('End Date')
            duration = "N/A"
            if start_date_str != 'N/A' and end_date_str != 'N/A':
                try:
                    import datetime
                    s_dt = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
                    e_dt = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
                    diff = e_dt - s_dt
                    days = diff.days
                    if days <= 0:
                        duration = "End of Day"
                    else:
                        months = days // 30
                        rem_days = days % 30
                        if months > 0:
                            duration = f"{months} month(s) {rem_days} day(s)"
                        else:
                            duration = f"{days} day(s)"
                except Exception:
                    duration = "N/A"

            job_details = {
                'job_code': job_code,
                'job_title': application.position or 'N/A',
                'client_job_id': extract_field('Client Job ID'),
                'location': extract_field('Location'),
                'duration': duration,
                'priority': extract_field('Priority') or 'N/A',
                'primary_skills': application.technology or 'N/A',
                'positions': extract_field('# Of Positions') or '1',
                'description': extract_field('Description')
            }

            # Gather ALL recruiters assigned to this same job (same job code, no candidate yet)
            sibling_apps = Application.objects.filter(
                candidate_name='',
                remarks__icontains=f'Job Code: {job_code}'
            ).exclude(assigned_employee=None).select_related('assigned_employee')

            recipients = []
            seen_emails = set()
            for app in sibling_apps:
                emp = app.assigned_employee
                if emp and emp.email not in seen_emails:
                    seen_emails.add(emp.email)
                    recipients.append({
                        'email': emp.email,
                        'name': emp.full_name or emp.email,
                    })

            # Fallback: at minimum include the current application's assignee
            if not recipients:
                recipients = [{
                    'email': application.assigned_employee.email,
                    'name': application.assigned_employee.full_name or application.assigned_employee.email,
                }]

            from users.tasks import send_job_assignment_email_task
            send_job_assignment_email_task.delay(
                associate_email=recipients[0]['email'],
                associate_name=recipients[0]['name'],
                lead_email=request_user.email,
                lead_name=request_user.full_name or request_user.email,
                job_details=job_details,
                associate_emails=recipients
            )

class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied
        if request.user.role != Role.ADMIN and not request.user.is_superuser:
            raise PermissionDenied("Only Administrators are allowed to delete records.")
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied
        if request.user.role not in [Role.ADMIN, Role.TEAM_LEAD, Role.SUB_LEAD] and not request.user.is_superuser:
            instance = self.get_object()
            if instance.status != 'New':
                # Check if non-status fields are being modified
                for field in ['candidate_name', 'candidate_email', 'candidate_phone', 'technology', 'position', 'client_name', 'experience', 'remarks']:
                    if field in request.data and request.data[field] != getattr(instance, field, None):
                        raise PermissionDenied("Only Administrators and Team Leads are allowed to edit records.")
        return super().update(request, *args, **kwargs)

    def get_permissions(self):
        if self.request.method not in permissions.SAFE_METHODS:
            class IsNotReportingTeam(permissions.BasePermission):
                def has_permission(self, request, view):
                    return request.user.role != Role.REPORTING_TEAM
            self.permission_classes = [permissions.IsAuthenticated, IsNotReportingTeam]
        return super().get_permissions()

    def get_queryset(self):
        # Auto-close expired job requirements (Throttled to run at most once every 10 minutes)
        from django.core.cache import cache
        from django.utils import timezone
        import re
        
        if cache.get('last_auto_close_time') is None:
            cache.set('last_auto_close_time', timezone.now().isoformat(), 600)
            try:
                # Find active requirements (no candidate assigned yet)
                active_jobs = Application.objects.filter(candidate_name='', remarks__icontains='Job Status: Active')
                for job in active_jobs:
                    remarks = job.remarks or ''
                    
                    # ALL JOBS EXPIRY: End of the creation day (11:59:59 PM) based on created_at
                    import datetime
                    expiry_time = timezone.make_aware(
                        datetime.datetime.combine(job.created_at.date(), datetime.time(23, 59, 59)),
                        job.created_at.tzinfo
                    )
                    if timezone.now() >= expiry_time:
                        new_remarks = remarks.replace('Job Status: Active', 'Job Status: Closed')
                        job.remarks = new_remarks
                        job.save(update_fields=['remarks'])
            except Exception:
                pass

        user = self.request.user
        
        # 1. Admin, CEO, Senior Manager, and Reporting Team can see all requirements and candidates
        if user.is_superuser or user.role in [Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.REPORTING_TEAM]:
            return Application.objects.all().select_related('assigned_employee').prefetch_related('notes', 'notes__author').order_by('-created_at')
        
        # 2. Junior Manager can see applications of teams/members reporting to them, plus their own
        if user.role == Role.JUNIOR_MANAGER:
            # Get members who report to this manager
            reporters = User.objects.filter(Q(reporting_to=user) | Q(reporting_to__reporting_to=user))
            return Application.objects.filter(
                Q(assigned_employee__in=reporters) |
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct().select_related('assigned_employee').prefetch_related('notes', 'notes__author').order_by('-created_at')

        # 3. Team Lead & Sub Lead can see applications of members reporting to them, plus their own
        if user.role in [Role.TEAM_LEAD, Role.SUB_LEAD]:
            # Get members who report to this lead
            reporters = User.objects.filter(Q(reporting_to=user) | Q(reporting_to__reporting_to=user))
            return Application.objects.filter(
                Q(assigned_employee__in=reporters) |
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct().select_related('assigned_employee').prefetch_related('notes', 'notes__author').order_by('-created_at')

        # 4. Associate Analyst & Senior Analyst can see only their assigned applications
        if user.role in [Role.ASSOCIATE_ANALYST, Role.SENIOR_ANALYST]:
            return Application.objects.filter(
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct().select_related('assigned_employee').prefetch_related('notes', 'notes__author').order_by('-created_at')

        return Application.objects.none()

    def get_serializer_class(self):
        if self.action == 'create':
            return ApplicationCreateSerializer
        return ApplicationSerializer

    @action(detail=False, methods=['get'], url_path='check-candidate')
    def check_candidate(self, request):
        email = request.query_params.get('email')
        phone = request.query_params.get('phone')
        if not email or not phone:
            return Response({'exists': False}, status=status.HTTP_200_OK)
            
        qs = Application.objects.exclude(candidate_name='').filter(
            candidate_email__iexact=email.strip(),
            candidate_phone=phone.strip()
        )
        if not qs.exists():
            return Response({'exists': False}, status=status.HTTP_200_OK)
            
        candidate = qs.first()
        assigned_jobs = []
        for app in qs:
            if app.position and app.client_name:
                assigned_jobs.append({
                    'position': app.position.lower().strip(),
                    'client_name': app.client_name.lower().strip(),
                })
                
        name_parts = (candidate.candidate_name or '').split(' ')
        first_name = name_parts[0] if len(name_parts) > 0 else ''
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''

        def extract_field_from_remarks(remarks_str, field_name):
            import re
            match = re.search(field_name + r':\s*(.*)', remarks_str or '')
            return match.group(1).strip() if match else ''

        remarks = candidate.remarks or ''
        return Response({
            'exists': True,
            'id': candidate.id,
            'candidate_name': candidate.candidate_name,
            'first_name': first_name,
            'last_name': last_name,
            'city': candidate.city,
            'state': candidate.state,
            'pan_card': candidate.pan_card,
            'aadhaar': candidate.aadhaar,
            'alternate_mobile_number': candidate.alternate_mobile_number,
            'source': candidate.source,
            'interest_to_work_for_client': candidate.interest_to_work_for_client,
            'experience': str(candidate.experience),
            'technology': candidate.technology,
            'degree': extract_field_from_remarks(remarks, 'Degree'),
            'location': extract_field_from_remarks(remarks, 'Location'),
            'expected_salary': extract_field_from_remarks(remarks, 'Expected Salary'),
            'notice_period': extract_field_from_remarks(remarks, 'Notice Period'),
            'resume_link': extract_field_from_remarks(remarks, 'Resume Link'),
            'assigned_jobs': assigned_jobs
        }, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        recruiter_val = self.request.data.get('recruiter')
        if not recruiter_val:
            recruiter_val = self.request.user.email
        application = serializer.save(recruiter=recruiter_val)
        check_and_send_assignment_email(application, self.request.user, is_new=True)

    def perform_update(self, serializer):
        instance = self.get_object()
        # Block editing of Job Code, Start Date, or End Date in Job Postings by Team Leads / Sub Leads
        if not instance.candidate_name and not serializer.validated_data.get('candidate_name'):
            if self.request.user.role in [Role.TEAM_LEAD, Role.SUB_LEAD]:
                def extract_field(remarks_str, field_name):
                    import re
                    match = re.search(field_name + r':\s*(.*)', remarks_str or '')
                    return match.group(1).strip() if match else 'N/A'

                old_remarks = instance.remarks or ''
                new_remarks = serializer.validated_data.get('remarks') or ''
                
                if (extract_field(old_remarks, 'Job Code') != extract_field(new_remarks, 'Job Code') or
                    extract_field(old_remarks, 'Start Date') != extract_field(new_remarks, 'Start Date') or
                    extract_field(old_remarks, 'End Date') != extract_field(new_remarks, 'End Date')):
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError("Team Leads are not allowed to change Job Code, Start Date, or End Date during edits.")

        old_assignee_email = instance.assigned_employee.email if instance.assigned_employee else None
        
        # Keep original recruiter value if it exists and a new one isn't provided in the request data
        recruiter_provided = 'recruiter' in self.request.data and self.request.data['recruiter']
        if instance.recruiter and not recruiter_provided:
            serializer.validated_data['recruiter'] = instance.recruiter
            
        user = self.request.user
        modified_by_val = user.full_name or user.email
        application = serializer.save(modified_by=modified_by_val)
        check_and_send_assignment_email(application, self.request.user, is_new=False, old_assignee_email=old_assignee_email)

    # Append a coordinator review note to the application
    @action(detail=True, methods=['post'], url_path='add-note')
    def add_note(self, request, pk=None):
        application = self.get_object()
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        note = serializer.save(
            application=application,
            author=request.user
        )
        
        # Auto-update application timestamp on new note
        application.save()
        
        return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)

    # Export filtered candidate listings to CSV
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        queryset = self.get_queryset()
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="ats_applications.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Candidate Name', 'Candidate Email', 'Candidate Phone',
            'Client Name', 'Position', 'Technology', 'Experience Required',
            'Recruiter', 'Assigned Associate', 'Status', 'Updated At'
        ])
        
        for app in queryset:
            writer.writerow([
                app.id,
                app.candidate_name or 'N/A',
                app.candidate_email or 'N/A',
                app.candidate_phone or 'N/A',
                app.client_name,
                app.position,
                app.technology,
                app.experience,
                app.recruiter or 'N/A',
                app.assigned_employee.full_name if app.assigned_employee else 'Unassigned',
                app.status,
                app.updated_at.strftime('%Y-%m-%d %H:%M:%S')
            ])
            
        return response

    # Upload resume to Cloudinary
    @action(detail=False, methods=['post'], url_path='upload-resume')
    def upload_resume(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
        
        import os
        import cloudinary
        import cloudinary.uploader
        
        cloudinary.config(
            cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME', 'ggdlbhrf'),
            api_key = os.getenv('CLOUDINARY_API_KEY', '154731121199677'),
            api_secret = os.getenv('CLOUDINARY_API_SECRET', 'dquFbWva1EO_bTI__FbKiCieRrs'),
            secure = True
        )
        
        try:
            result = cloudinary.uploader.upload(
                file_obj,
                resource_type="raw",
                public_id=file_obj.name
            )
            secure_url = result.get('secure_url')
            return Response({'url': secure_url}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='parse-resume')
    def parse_resume(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
        
        name = file_obj.name.lower()
        text = ""
        
        try:
            if name.endswith('.pdf'):
                import pypdf
                reader = pypdf.PdfReader(file_obj)
                pages_text = []
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        pages_text.append(t)
                text = "\n".join(pages_text)
            elif name.endswith('.docx'):
                import docx2txt
                text = docx2txt.process(file_obj)
            elif name.endswith('.txt'):
                text = file_obj.read().decode('utf-8', errors='ignore')
            else:
                return Response({'error': 'Unsupported file format. Please upload PDF, DOCX or TXT'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Failed to read file contents: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Regex heuristics to parse details from raw text
        import re
        
        # 1. Extract email
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(email_pattern, text)
        email = emails[0] if emails else ""

        # 2. Extract phone
        phone_pattern = r'(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}'
        phones = re.findall(phone_pattern, text)
        phone = phones[0] if phones else ""

        # 3. Extract name (look at the first 8 non-empty lines that don't match email, phone, or standard headers)
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        candidate_name = ""
        for line in lines[:8]:
            # Skip if contains email, phone, or starts with common resume headers
            if "@" in line or any(p in line.lower() for p in ["phone", "resume", "cv", "page", "profile"]) or re.search(r'\d{4,}', line):
                continue
            # Words count should be between 2 and 4 (standard name)
            words = line.split()
            if 2 <= len(words) <= 4:
                candidate_name = line
                break
        
        # Fallback to filename if name not found in text
        if not candidate_name:
            filename_clean = re.sub(r'[-_]', ' ', file_obj.name.split('.')[0])
            filename_words = [w for w in filename_clean.split() if w.lower() not in ['resume', 'cv', 'latest', 'updated']]
            if filename_words:
                candidate_name = " ".join(filename_words).title()
            else:
                candidate_name = "Candidate Profile"

        # 4. Extract experience (removed as requested, keeping field blank)
        experience = ""

        # 5. Extract degree (exact higher qualification line, prioritizing Education section)
        degree = ""
        degree_ranks = [
            (r'\b(?:ph\.?d|doctorate|doctor of philosophy)\b', 5, 'PhD'),
            (r'\b(?:master|m\.?s\b|m\.?tech|m\.?c\.?a|m\.?b\.?a|m\.?e|m\.?phil|post\s*graduate)\b', 4, 'Masters'),
            (r'\b(?:bachelor|b\.?s\b|b\.?tech|b\.?e\b|b\.?c\.?a|b\.?b\.?a|b\.?sc|undergraduate)\b', 3, 'Bachelors'),
            (r'\b(?:diploma|associate)\b', 2, 'Diploma')
        ]
        
        lines_list = [line.strip() for line in text.split('\n') if line.strip()]
        best_rank = 0
        best_val = ""
        in_education = False
        
        edu_headers = r'^(?:education|educational|academics?|academic background|qualifications?)\b'
        other_headers = r'^(?:experience|employment|work|history|professional|projects?|skills?|summary|profile|about|certifications?)\b'
        
        for line in lines_list:
            # Check for section boundaries
            if re.search(edu_headers, line, re.IGNORECASE):
                in_education = True
                continue
            elif re.search(other_headers, line, re.IGNORECASE):
                in_education = False
                
            for pattern, rank, label in degree_ranks:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    # Boost rank significantly if found inside the Education section
                    actual_rank = rank + 10 if in_education else rank
                    if actual_rank > best_rank:
                        best_rank = actual_rank
                        matched_text = match.group(0)
                        
                        # Find the most specific degree phrase in that line
                        detailed_patterns = [
                            r'\b(?:master of science|master of technology|master of computer applications|master of business administration|master of engineering)\b',
                            r'\b(?:bachelor of technology|bachelor of science|bachelor of engineering|bachelor of computer applications|bachelor of business administration)\b',
                            r'\b(?:m\.?s\b|m\.?tech|m\.?c\.?a|m\.?b\.?a|b\.?s\b|b\.?tech|b\.?e\b|b\.?c\.?a|ph\.?d|diploma)\b',
                            r'\b(?:masters?|bachelors?|doctorate|diploma)\b'
                        ]
                        for dp in detailed_patterns:
                            m_det = re.search(dp, line, re.IGNORECASE)
                            if m_det:
                                matched_text = m_det.group(0)
                                break
                        
                        # Normalize punctuation (e.g. M.Tech -> M.Tech)
                        normalized = matched_text.strip()
                        # Capitalize nicely
                        best_val = normalized.title() if len(normalized) > 4 else normalized.upper()
        
        degree = best_val if best_val else "Bachelors Degree"

        # 6. Extract skills
        common_skills = [
            "React", "Angular", "Vue", "JavaScript", "TypeScript", "Node", "Express",
            "Python", "Django", "Flask", "FastAPI", "Java", "Spring Boot", "Spring",
            "Hibernate", "C#", ".NET", "C++", "Golang", "PHP", "Laravel", "Ruby",
            "Rails", "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch",
            "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins",
            "Git", "HTML", "CSS", "Sass", "Redux", "GraphQL", "REST API", "Microservices"
        ]
        matched_skills = []
        for skill in common_skills:
            if re.search(r'\b' + re.escape(skill) + r'\b', text, re.IGNORECASE):
                matched_skills.append(skill)
        
        skills_str = ", ".join(matched_skills[:8]) if matched_skills else "React, TypeScript, JavaScript"

        # Split candidate_name into first/last name
        name_parts = candidate_name.split()
        first_name = name_parts[0] if name_parts else "Jane"
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "Smith"

        return Response({
            'firstName': first_name,
            'lastName': last_name,
            'email': email,
            'phone': phone,
            'skills': skills_str,
            'experience': experience,
            'degree': degree,
            'fileName': file_obj.name
        }, status=status.HTTP_200_OK)


    # Dynamic metrics loader for role dashboards
    @action(detail=False, methods=['get'], url_path='dashboard-stats')
    def dashboard_stats(self, request):
        user = request.user
        
        # A. ADMIN / CEO STATS
        if user.is_superuser or user.role in [Role.ADMIN, Role.CEO]:
            total_staff = User.objects.count()
            active_staff = User.objects.filter(is_active=True).count()
            inactive_staff = total_staff - active_staff
            
            # Role breakups
            role_breakups = User.objects.values('role').annotate(count=Count('role'))
            role_data = {item['role']: item['count'] for item in role_breakups}
            
            # Team breakups
            team_breakups = User.objects.values('team__name').annotate(count=Count('email'))
            team_data = {item['team__name'] or 'Unassigned': item['count'] for item in team_breakups}

            return Response({
                'dashboard_type': 'ADMIN',
                'total_employees': total_staff,
                'active_employees': active_staff,
                'inactive_employees': inactive_staff,
                'role_distribution': role_data,
                'team_distribution': team_data
            }, status=status.HTTP_200_OK)

        # B. MANAGER / LEADER STATS
        elif user.role in [Role.SENIOR_MANAGER, Role.JUNIOR_MANAGER, Role.TEAM_LEAD, Role.SUB_LEAD]:
            # Get all teams the user leads or belongs to
            user_teams = list(user.teams.all())
            first_team = user_teams[0] if user_teams else None
            team_name = first_team.name if first_team else 'General'
            
            # Resolve team roster
            if user.role == Role.SENIOR_MANAGER:
                team_members = User.objects.filter(role=Role.ASSOCIATE_ANALYST)
            elif user_teams:
                team_members = User.objects.filter(teams__in=user_teams, role=Role.ASSOCIATE_ANALYST).distinct()
            else:
                team_members = User.objects.none()

            team_applications = Application.objects.filter(assigned_employee__in=team_members)
            
            open_reqs = team_applications.filter(status='New').count()
            active_pipes = team_applications.exclude(status__in=['New', 'Selected', 'Rejected', 'Closed']).count()
            total_hires = team_applications.filter(status='Selected').count()

            return Response({
                'dashboard_type': 'LEAD',
                'team_name': team_name,
                'team_associates_count': team_members.count(),
                'open_requirements': open_reqs,
                'active_pipeline': active_pipes,
                'total_hires': total_hires,
                'selection_rate': round((total_hires / team_applications.count() * 100), 1) if team_applications.exists() else 0.0
            }, status=status.HTTP_200_OK)

        # C. ASSOCIATE ANALYST STATS
        elif user.role == Role.ASSOCIATE_ANALYST:
            my_apps = Application.objects.filter(assigned_employee=user)
            
            my_new = my_apps.filter(status='New').count()
            my_active = my_apps.exclude(status__in=['New', 'Selected', 'Rejected', 'Closed']).count()
            my_hires = my_apps.filter(status='Selected').count()

            return Response({
                'dashboard_type': 'ASSOCIATE',
                'my_total_positions': my_apps.count(),
                'pending_sourcing': my_new,
                'active_pipeline': my_active,
                'placed_candidates': my_hires,
                'sourced_rate': round(((my_apps.count() - my_new) / my_apps.count() * 100), 1) if my_apps.exists() else 0.0
            }, status=status.HTTP_200_OK)

        return Response({"error": "Stats not resolved for role."}, status=status.HTTP_400_BAD_REQUEST)
