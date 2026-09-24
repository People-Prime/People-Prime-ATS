import csv
import re
from datetime import datetime, date
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Q, Exists, OuterRef, Prefetch
from django.utils import timezone
from applications.models import Application, Note, CareerPortalApplicant
from applications.serializers import (
    ApplicationSerializer, ApplicationCreateSerializer, NoteSerializer,
    CareerPortalApplicantSerializer
)
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

            def _dispatch_email():
                try:
                    from users.tasks import send_job_assignment_email_task
                    send_job_assignment_email_task.delay(
                        associate_email=recipients[0]['email'],
                        associate_name=recipients[0]['name'],
                        lead_email=request_user.email,
                        lead_name=request_user.full_name or request_user.email,
                        job_details=job_details,
                        associate_emails=recipients
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to queue assignment email: {e}")

            import threading
            threading.Thread(target=_dispatch_email, daemon=True).start()


class Echo:
    """An object that implements just the write method of the file-like interface."""
    def write(self, value):
        """Write the value by returning it, instead of storing in a buffer."""
        return value


def _extract_remark_field_for_export(remarks, field_name):
    if not remarks:
        return 'N/A'
    if field_name == 'Variable Pay':
        m = re.search(r'^(Variable Pay|Gross Revenue):[ \t]*(.+)', remarks, re.IGNORECASE | re.MULTILINE)
        if m:
            val = m.group(2).strip()
            return val if val else 'N/A'
        return 'N/A'
    if field_name == 'Offer Value':
        m = re.search(r'^(Offer Value|Invoice Amount):[ \t]*(.+)', remarks, re.IGNORECASE | re.MULTILINE)
        if m:
            val = m.group(2).strip()
            return val if val else 'N/A'
        return 'N/A'
    m = re.search(rf'^{re.escape(field_name)}:[ \t]*(.+)', remarks, re.IGNORECASE | re.MULTILINE)
    if m:
        val = m.group(1).strip()
        clean_val = val if val else 'N/A'
        if field_name == 'Job Code' and clean_val != 'N/A':
            if not clean_val.upper().startswith('PPW'):
                return 'N/A'
        return clean_val
    return 'N/A'


def _format_date_ddmmyyyy(val):
    if not val or val in ('N/A', '—', 'None', 'undefined', 'null'):
        return 'N/A'
    if isinstance(val, (datetime, date)):
        return val.strftime('%d-%m-%Y')
    s = str(val).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        parts = s.split('T')[0].split('-')
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
    try:
        dt = datetime.fromisoformat(s)
        return dt.strftime('%d-%m-%Y')
    except Exception:
        pass
    return s


from rest_framework.pagination import PageNumberPagination

class StandardResultsSetPagination(PageNumberPagination):
    """
    Always-on pagination for ApplicationViewSet.
    Prevents full-table loads that caused OOM kills.
    Default page_size=50, max=100.
    all_records=true is only honored when bounded by date filters, status=Placed,
    or global search, and capped at MAX_UNPAGINATED_RECORDS (2000).
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100
    MAX_UNPAGINATED_RECORDS = 2000

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get('all_records') == 'true':
            has_date_filter = bool(request.query_params.get('start_date') and request.query_params.get('end_date'))
            has_status_placed = request.query_params.get('status') == 'Placed'
            has_search = bool(request.query_params.get('global_search'))

            # Unbounded all_records requests are strictly prohibited to prevent OOM
            if not (has_date_filter or has_status_placed or has_search):
                return super().paginate_queryset(queryset, request, view)

            # Enforce safety ceiling: if bounded query still returns too many rows, enforce pagination
            if queryset.count() > self.MAX_UNPAGINATED_RECORDS:
                return super().paginate_queryset(queryset, request, view)

            return None
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'results': data
        })

class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

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
        user = self.request.user
        global_search = self.request.query_params.get('global_search')
        all_applicants = self.request.query_params.get('all_applicants') == 'true'

        # Base role-based visibility querysets
        if user.is_superuser or user.role in [Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.REPORTING_TEAM]:
            qs = Application.objects.all()
        elif user.role == Role.JUNIOR_MANAGER:
            reporters = User.objects.filter(Q(reporting_to=user) | Q(reporting_to__reporting_to=user))
            qs = Application.objects.filter(
                Q(assigned_employee__in=reporters) |
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct()
        elif user.role in [Role.TEAM_LEAD, Role.SUB_LEAD]:
            reporters = User.objects.filter(Q(reporting_to=user) | Q(reporting_to__reporting_to=user))
            qs = Application.objects.filter(
                Q(assigned_employee__in=reporters) |
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct()
        elif user.role in [Role.ASSOCIATE_ANALYST, Role.SENIOR_ANALYST]:
            qs = Application.objects.filter(
                Q(assigned_employee=user) |
                Q(recruiter=user.full_name) |
                Q(recruiter=user.email)
            ).distinct()
        else:
            qs = Application.objects.none()

        # Apply is_job_posting filtering if present
        is_job_posting = self.request.query_params.get('is_job_posting')
        if is_job_posting == 'true':
            qs = qs.filter(candidate_name='')
        elif is_job_posting == 'false':
            qs = qs.exclude(candidate_name='')

        # Apply team filter if present
        team_id = self.request.query_params.get('team_id')
        if team_id and team_id != 'ALL':
            qs = qs.filter(assigned_employee__teams__id=team_id)

        # Apply global search if present
        if global_search:
            search_query = Q(candidate_name__icontains=global_search) | \
                           Q(candidate_email__icontains=global_search) | \
                           Q(candidate_phone__icontains=global_search) | \
                           Q(client_name__icontains=global_search) | \
                           Q(position__icontains=global_search) | \
                           Q(technology__icontains=global_search) | \
                           Q(remarks__icontains=global_search)
            if global_search.isdigit():
                search_query |= Q(id=int(global_search))
            qs = qs.filter(search_query)

        # Apply status filter if present
        status_param = self.request.query_params.get('status')
        if status_param and status_param not in ['ALL', 'HAS_CANDIDATE', 'INTERVIEWS']:
            qs = qs.filter(status=status_param)
        elif status_param == 'INTERVIEWS':
            qs = qs.filter(status__in=['Interview Scheduled', 'Interview Completed'])
        elif status_param == 'HAS_CANDIDATE':
            qs = qs.exclude(candidate_name='')

        # Apply date range filtering if not in global search
        if not global_search:
            start_date = self.request.query_params.get('start_date')
            end_date = self.request.query_params.get('end_date')
            all_applicants = self.request.query_params.get('all_applicants')
 
            if start_date and end_date:
 
                # Dashboard / all applicants:
                # Count applications ONLY by their creation date.
                # A status change on an older application must NOT
                # move that application into today's dashboard count.
                if all_applicants == 'true':
                    qs = qs.filter(
                        created_at__date__gte=start_date,
                        created_at__date__lte=end_date
                    )
 
                # Normal Applicants page:
                # Preserve existing behavior where a status transition
                # during the selected date range can make an application
                # appear.
                else:
                    status_transition_subquery = Note.objects.filter(
                        application=OuterRef('pk'),
                        content__startswith="Status updated to ",
                        created_at__date__gte=start_date,
                        created_at__date__lte=end_date
                    )
 
                    qs = qs.filter(
                        Q(
                            created_at__date__gte=start_date,
                            created_at__date__lte=end_date
                        ) |
                        Exists(status_transition_subquery)
                    ).distinct()

        if self.action == 'list':
            # Prefetch ONLY status-transition notes (not all 81k notes).
            # These are stored in the to_attr 'status_notes' so the serializer
            # can build transition_dates without hitting obj.notes.all().
            status_notes_prefetch = Prefetch(
                'notes',
                queryset=Note.objects.filter(
                    content__startswith='Status updated to '
                ).select_related('author').order_by('created_at'),
                to_attr='status_notes'
            )
            return qs.select_related('assigned_employee') \
                     .prefetch_related(status_notes_prefetch) \
                     .defer('ai_job_embedding', 'ai_job_embedding_nemotron',
                            'ai_job_embedding_metadata', 'job_embedding') \
                     .order_by('-created_at')

        return qs.select_related('assigned_employee').prefetch_related('notes', 'notes__author').order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return ApplicationCreateSerializer
        return ApplicationSerializer

    @action(detail=False, methods=['get'], url_path='job-candidates')
    def job_candidates(self, request):
        """
        Return all candidate Application records associated with a specific job.
        Used by ViewCandidates page to avoid loading the entire application table.

        Required query param: job_id (the Application ID of the parent job posting)
        """
        job_id = request.query_params.get('job_id')
        if not job_id:
            return Response(
                {'error': 'job_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Fetch the parent job posting first (validates it exists and is accessible)
        try:
            parent_job = self.get_queryset().filter(candidate_name='', pk=job_id).first()
        except (ValueError, TypeError):
            return Response({'error': 'Invalid job_id'}, status=status.HTTP_400_BAD_REQUEST)

        if not parent_job:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        # Extract job code from remarks to find sibling candidate applications
        job_code_match = re.search(r'Job Code:\s*(.*)', parent_job.remarks or '')
        job_code = job_code_match.group(1).strip() if job_code_match else None

        # Find candidates for this job by job code in remarks, or by position+client match
        base_qs = self.get_queryset().exclude(candidate_name='') \
            .select_related('assigned_employee') \
            .prefetch_related(
                Prefetch(
                    'notes',
                    queryset=Note.objects.filter(
                        content__startswith='Status updated to '
                    ).select_related('author').order_by('created_at'),
                    to_attr='status_notes'
                )
            ) \
            .defer('ai_job_embedding', 'ai_job_embedding_nemotron',
                   'ai_job_embedding_metadata', 'job_embedding') \
            .order_by('-created_at')

        if job_code and 'Auto Generated' not in job_code:
            candidates = base_qs.filter(remarks__icontains=f'Job Code: {job_code}')
        else:
            # Fall back to position + client match
            candidates = base_qs.filter(
                position__iexact=parent_job.position,
                client_name__iexact=parent_job.client_name
            )

        serializer = ApplicationSerializer(candidates, many=True, context={'request': request})
        return Response({
            'job': ApplicationSerializer(parent_job, context={'request': request}).data,
            'candidates': serializer.data,
            'count': candidates.count()
        })

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
        serializer.instance._modifying_user = user
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

    # Export filtered candidate listings to CSV (Full 27 columns, unlimited streaming)
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        queryset = self.get_queryset()

        status_notes_prefetch = Prefetch(
            'notes',
            queryset=Note.objects.filter(
                content__startswith='Status updated to '
            ).order_by('created_at'),
            to_attr='status_notes'
        )
        queryset = queryset.select_related('assigned_employee') \
                           .prefetch_related(status_notes_prefetch) \
                           .defer('ai_job_embedding', 'ai_job_embedding_nemotron',
                                  'ai_job_embedding_metadata', 'job_embedding') \
                           .order_by('-created_at')

        # 1. Pre-fetch all parent job postings into memory once for parent job fallbacks
        parent_jobs = list(Application.objects.filter(candidate_name='').select_related('assigned_employee'))
        parent_by_code = {}
        parent_by_title_client = {}
        sibling_recruiters_by_code = {}

        for pj in parent_jobs:
            code = _extract_remark_field_for_export(pj.remarks, 'Job Code')
            if code and code != 'N/A':
                parent_by_code[code] = pj
                if code not in sibling_recruiters_by_code:
                    sibling_recruiters_by_code[code] = []
                if pj.assigned_employee and pj.assigned_employee.email:
                    sibling_recruiters_by_code[code].append(pj.assigned_employee.email)

            pos = (pj.position or '').lower().strip()
            client = (pj.client_name or '').lower().strip()
            if pos and client and (pos, client) not in parent_by_title_client:
                parent_by_title_client[(pos, client)] = pj

        # 2. Pre-fetch users for hierarchy resolution
        all_users = {u.email.lower(): u for u in User.objects.all().prefetch_related('reporting_to')}
        reporting_map = {
            u.email.lower(): [p.email.lower() for p in u.reporting_to.all()]
            for u in all_users.values()
        }

        def get_hierarchy_info(recruiter_emails):
            tls = set()
            managers = set()
            for email in recruiter_emails:
                curr_email = email.lower() if email else ''
                visited = set()
                while curr_email and curr_email not in visited:
                    visited.add(curr_email)
                    curr_user = all_users.get(curr_email)
                    if not curr_user:
                        break
                    if curr_user.role in [Role.TEAM_LEAD, Role.SUB_LEAD]:
                        tls.add(curr_user.full_name or curr_user.email)
                    if curr_user.role in [Role.JUNIOR_MANAGER, Role.SENIOR_MANAGER]:
                        managers.add(curr_user.full_name or curr_user.email)

                    parents = reporting_map.get(curr_email, [])
                    curr_email = parents[0] if parents else None

            return {
                'tl': ', '.join(sorted(tls)) if tls else 'N/A',
                'manager': ', '.join(sorted(managers)) if managers else 'N/A'
            }

        hierarchy_cache = {}
        def get_cached_hierarchy(recruiter_emails):
            key = tuple(sorted(recruiter_emails))
            if key not in hierarchy_cache:
                hierarchy_cache[key] = get_hierarchy_info(recruiter_emails)
            return hierarchy_cache[key]

        headers = [
            'Applicant ID',
            'Applicant Name',
            'Email',
            'Job Code',
            'City',
            'State',
            'Applicant Status',
            'Job Title',
            'Job Type',
            'Client Name',
            'Tentative Start Date',
            'Manager',
            'Team Lead',
            'Recruiter',
            'PAN Card',
            'Aadhaar',
            'Alt Mobile',
            'Source',
            'Interest to Work',
            'Modified By',
            'Pay Rate',
            'Variable Pay',
            'Offer Value',
            'Profit Amount',
            'Date of Join',
            'Created Date',
            'Status Changed Date'
        ]

        pseudo_buffer = Echo()
        writer = csv.writer(pseudo_buffer)

        def row_generator():
            yield writer.writerow(headers)
            for app in queryset.iterator(chunk_size=2000):
                # Job code resolution
                display_job_code = _extract_remark_field_for_export(app.remarks, 'Job Code')
                if display_job_code == 'N/A' or not display_job_code:
                    pos_key = ((app.position or '').lower().strip(), (app.client_name or '').lower().strip())
                    pj_by_title = parent_by_title_client.get(pos_key)
                    if pj_by_title:
                        p_code = _extract_remark_field_for_export(pj_by_title.remarks, 'Job Code')
                        display_job_code = p_code if (p_code and p_code != 'N/A') else f"PPW - {pj_by_title.id:04d}"
                if not display_job_code:
                    display_job_code = 'N/A'

                display_position = app.position if (app.position and app.position != 'N/A') else 'N/A'
                pj = parent_by_code.get(display_job_code)
                display_job_type = _extract_remark_field_for_export(pj.remarks, 'Job Type') if pj else 'N/A'
                display_client_name = app.client_name if (app.client_name and app.client_name != 'N/A') else (pj.client_name if pj and pj.client_name else 'N/A')
                display_start_date = _extract_remark_field_for_export(pj.remarks, 'Start Date') if pj else 'N/A'

                recruiter_emails = list(sibling_recruiters_by_code.get(display_job_code, []))
                if not recruiter_emails and app.assigned_employee and app.assigned_employee.email:
                    recruiter_emails.append(app.assigned_employee.email)

                hierarchy = get_cached_hierarchy(recruiter_emails)

                # Status changed date
                status_changed_date = None
                if hasattr(app, 'status_notes') and app.status_notes:
                    for note in app.status_notes:
                        if note.content and note.content.startswith("Status updated to "):
                            status_part = note.content[18:].split(".")[0].split("\n")[0].strip()
                            if status_part == app.status:
                                status_changed_date = note.created_at
                                break
                if not status_changed_date:
                    status_changed_date = app.updated_at

                row = [
                    app.id,
                    app.candidate_name or 'N/A',
                    app.candidate_email or 'N/A',
                    display_job_code,
                    app.city or 'N/A',
                    app.state or 'N/A',
                    app.status or 'N/A',
                    display_position,
                    display_job_type,
                    display_client_name,
                    _format_date_ddmmyyyy(display_start_date),
                    hierarchy['manager'],
                    hierarchy['tl'],
                    app.recruiter or (app.assigned_employee.full_name if app.assigned_employee else 'System'),
                    app.pan_card or 'N/A',
                    app.aadhaar or 'N/A',
                    app.alternate_mobile_number or 'N/A',
                    app.source or 'N/A',
                    app.interest_to_work_for_client or 'N/A',
                    app.modified_by or 'System',
                    _extract_remark_field_for_export(app.remarks, 'Pay Rate'),
                    _extract_remark_field_for_export(app.remarks, 'Variable Pay'),
                    _extract_remark_field_for_export(app.remarks, 'Offer Value'),
                    _extract_remark_field_for_export(app.remarks, 'Profit Amount'),
                    _format_date_ddmmyyyy(_extract_remark_field_for_export(app.remarks, 'Date of Join')),
                    _format_date_ddmmyyyy(app.created_at),
                    _format_date_ddmmyyyy(status_changed_date)
                ]
                yield writer.writerow(row)

        response = StreamingHttpResponse(row_generator(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="ats_applications.csv"'
        return response

    # Generate a pre-signed S3 URL for secure resume access (valid 1 hour)
    @action(detail=False, methods=['post'], url_path='generate-resume-url')
    def generate_resume_url(self, request):
        import boto3
        from botocore.config import Config
        import os
        import re
        from urllib.parse import urlparse, unquote

        raw_url = request.data.get('url', '')
        if not raw_url:
            return Response({'error': 'No URL provided'}, status=status.HTTP_400_BAD_REQUEST)

        parsed = urlparse(raw_url)
        s3_key = unquote(unquote(os.path.basename(parsed.path)))

        bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage')
        region = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
        access_key = os.getenv('AWS_ACCESS_KEY_ID')
        secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')

        try:
            s3_config = Config(
                connect_timeout=5,
                read_timeout=15,
                retries={'max_attempts': 2}
            )
            s3_client = boto3.client(
                's3',
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=s3_config
            )

            # Check if key exists in S3
            found_key = None
            try:
                s3_client.head_object(Bucket=bucket_name, Key=s3_key)
                found_key = s3_key
            except Exception:
                # Try space/underscore variations
                candidates = [
                    s3_key,
                    s3_key.replace('.docx', ' .docx').replace('.pdf', ' .pdf').replace('.doc', ' .doc'),
                    s3_key.replace(' .docx', '.docx').replace(' .pdf', '.pdf').replace(' .doc', '.doc'),
                    s3_key.replace(' ', '_'),
                    s3_key.replace('_', ' ')
                ]
                for cand in candidates:
                    try:
                        s3_client.head_object(Bucket=bucket_name, Key=cand)
                        found_key = cand
                        break
                    except Exception:
                        pass

            if found_key:
                # File exists in S3 -> Generate S3 presigned URL
                params = {
                    'Bucket': bucket_name,
                    'Key': found_key,
                    'ResponseContentDisposition': 'inline'
                }
                if found_key.lower().endswith('.pdf'):
                    params['ResponseContentType'] = 'application/pdf'
                elif found_key.lower().endswith('.docx'):
                    params['ResponseContentType'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                elif found_key.lower().endswith('.doc'):
                    params['ResponseContentType'] = 'application/msword'

                presigned_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params=params,
                    ExpiresIn=3600
                )
                return Response({'url': presigned_url}, status=status.HTTP_200_OK)

            # Fallback for legacy Cloudinary links: Generate signed Cloudinary URL
            if 'cloudinary.com' in raw_url:
                import cloudinary, cloudinary.utils
                cloudinary.config(
                    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME', 'ggdlbhrf'),
                    api_key=os.getenv('CLOUDINARY_API_KEY', '154731121199677'),
                    api_secret=os.getenv('CLOUDINARY_API_SECRET', 'dquFbWva1EO_bTI__FbKiCieRrs')
                )
                archive_url = cloudinary.utils.download_archive_url(
                    public_ids=[s3_key],
                    resource_type='raw'
                )
                return Response({'url': archive_url}, status=status.HTTP_200_OK)

            return Response({'error': f'Resume file {s3_key} not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Upload resume directly to AWS S3
    @action(detail=False, methods=['post'], url_path='upload-resume')
    def upload_resume(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
        
        import os
        import boto3
        from botocore.config import Config

        bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage')
        region = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
        access_key = os.getenv('AWS_ACCESS_KEY_ID')
        secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
        
        try:
            s3_config = Config(
                connect_timeout=5,
                read_timeout=15,
                retries={'max_attempts': 2}
            )
            s3_client = boto3.client(
                's3',
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=s3_config
            )
            filename = file_obj.name
            
            content_type = 'application/octet-stream'
            if filename.lower().endswith('.pdf'):
                content_type = 'application/pdf'
            elif filename.lower().endswith('.docx'):
                content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif filename.lower().endswith('.doc'):
                content_type = 'application/msword'

            s3_client.upload_fileobj(
                file_obj,
                bucket_name,
                filename,
                ExtraArgs={'ContentType': content_type}
            )

            s3_url = f"s3://{bucket_name}/{filename}"
            return Response({'url': s3_url}, status=status.HTTP_200_OK)
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

    @action(detail=False, methods=['get'], url_path='hierarchy-stats')
    def hierarchy_stats(self, request):
        import re
        from collections import defaultdict
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        apps = list(Application.objects.select_related('assigned_employee').only(
            'id', 'candidate_name', 'candidate_email', 'position', 'client_name',
            'remarks', 'recruiter', 'assigned_employee_id', 'assigned_employee__email',
            'status', 'modified_by', 'created_at'
        ).all())

        notes_qs = Note.objects.filter(content__istartswith='Status updated to ').values('application_id', 'content', 'created_at')
        notes_dict = defaultdict(list)
        for n in notes_qs:
            notes_dict[n['application_id']].append(n)

        def get_remark_field(remarks, field_name):
            if not remarks:
                return 'N/A'
            m = re.search(r'^' + field_name + r':[ \t]*(.+)', remarks, re.M | re.I)
            val = m.group(1).strip() if m else 'N/A'
            if field_name == 'Job Code' and val != 'N/A':
                if not val.upper().startswith('PPW'):
                    return 'N/A'
            return val if val else 'N/A'

        candidate_groups = defaultdict(list)
        for a in apps:
            if not a.candidate_name:
                continue
            k = (a.candidate_email or '').lower().strip() or (a.candidate_name or '').lower().strip()
            candidate_groups[k].append(a)

        deduplicated_apps = []
        for a in apps:
            if not a.candidate_name:
                deduplicated_apps.append(a)
                continue
            k = (a.candidate_email or '').lower().strip() or (a.candidate_name or '').lower().strip()
            group = candidate_groups[k]
            has_real_job = any(get_remark_field(x.remarks, 'Job Code') != 'N/A' for x in group)
            if has_real_job:
                if get_remark_field(a.remarks, 'Job Code') != 'N/A':
                    deduplicated_apps.append(a)
            else:
                if a.id == group[0].id:
                    deduplicated_apps.append(a)

        code_map = {}
        pos_client_map = defaultdict(list)
        for a in deduplicated_apps:
            if a.candidate_name:
                continue
            code = get_remark_field(a.remarks, 'Job Code')
            if code and code != 'N/A':
                key = code.upper().strip()
                if key not in code_map:
                    code_map[key] = a
            norm_pos = (a.position or '').lower().strip()
            norm_client = (a.client_name or '').lower().strip()
            if norm_pos and norm_client:
                pos_client_map[f'{norm_pos}|{norm_client}'].append(a)

        def find_parent_job(app):
            if not app:
                return None
            if not app.candidate_name:
                return app
            direct_code = get_remark_field(app.remarks, 'Job Code')
            if direct_code and direct_code != 'N/A':
                p = code_map.get(direct_code.upper().strip())
                if p:
                    return p
            norm_pos = (app.position or '').lower().strip()
            norm_client = (app.client_name or '').lower().strip()
            if not norm_pos or not norm_client:
                return None
            candidates = pos_client_map.get(f'{norm_pos}|{norm_client}')
            if not candidates:
                return None
            if start_date and end_date:
                for c in candidates:
                    d = (c.created_at.strftime('%Y-%m-%d') if c.created_at else '')
                    if d >= start_date and d <= end_date:
                        return c
            sub_date = (app.created_at.strftime('%Y-%m-%d') if app.created_at else '')
            on_or_before = [c for c in candidates if (c.created_at.strftime('%Y-%m-%d') if c.created_at else '') <= sub_date]
            if on_or_before:
                on_or_before.sort(key=lambda x: x.created_at, reverse=True)
                return on_or_before[0]
            return candidates[0]

        def get_status_transition_date(app, target_status):
            app_notes = notes_dict.get(app.id, [])
            target_prefix = f'status updated to {target_status}'.lower()
            matching_notes = [n for n in app_notes if (n['content'] or '').strip().lower().startswith(target_prefix)]
            if matching_notes:
                matching_notes.sort(key=lambda n: n['created_at'], reverse=True)
                return matching_notes[0]['created_at'].strftime('%Y-%m-%d')
            if app.status == target_status:
                return app.created_at.strftime('%Y-%m-%d')
            return ''

        users = list(User.objects.filter(is_active=True).exclude(role__in=['ADMIN', 'REPORTING_TEAM']))
        user_by_email = {u.email.lower(): u.email.lower() for u in users}
        name_to_emails = defaultdict(list)
        for u in users:
            if u.full_name:
                name_to_emails[u.full_name.lower()].append(u.email.lower())

        user_apps_map = defaultdict(list)
        user_subs_map = defaultdict(list)

        for a in deduplicated_apps:
            matched_emails = set()
            if a.assigned_employee:
                emp_email = a.assigned_employee.email.lower()
                if emp_email in user_by_email:
                    matched_emails.add(emp_email)
                if a.candidate_name:
                    user_subs_map[emp_email].append(a)
            
            if a.recruiter:
                rec_lower = a.recruiter.lower()
                if rec_lower in user_by_email:
                    matched_emails.add(rec_lower)
                if rec_lower in name_to_emails:
                    for target in name_to_emails[rec_lower]:
                        matched_emails.add(target)

            for e in matched_emails:
                user_apps_map[e].append(a)

        user_metrics = {}

        for u in users:
            email = u.email.lower()
            user_apps = user_apps_map.get(email, [])
            
            seen_jobs = set()
            for a in user_apps:
                p_job = find_parent_job(a) or a
                d = (p_job.created_at.strftime('%Y-%m-%d') if p_job.created_at else '')
                if not start_date or not end_date or (d >= start_date and d <= end_date):
                    code = get_remark_field(p_job.remarks, 'Job Code')
                    if not code or code == 'N/A':
                        if not p_job.candidate_name:
                            code = f'PPW-{str(p_job.id).zfill(4)}'
                    if code and code != 'N/A':
                        seen_jobs.add(code.upper().strip())

            sub_count = 0
            for a in user_subs_map.get(email, []):
                d = get_status_transition_date(a, 'Submitted')
                if d and (not start_date or not end_date or (d >= start_date and d <= end_date)):
                    sub_count += 1

            int_count = 0
            for a in user_apps:
                d_s = get_status_transition_date(a, 'Interview Scheduled')
                d_c = get_status_transition_date(a, 'Interview Completed')
                match_s = bool(d_s and (not start_date or not end_date or (d_s >= start_date and d_s <= end_date)))
                match_c = bool(d_c and (not start_date or not end_date or (d_c >= start_date and d_c <= end_date)))
                if match_s or match_c:
                    int_count += 1

            off_count = sum(1 for a in user_apps if (lambda d: bool(d and (not start_date or not end_date or (d >= start_date and d <= end_date))))(get_status_transition_date(a, 'Offer Sent')))
            off_acc = sum(1 for a in user_apps if (lambda d: bool(d and (not start_date or not end_date or (d >= start_date and d <= end_date))))(get_status_transition_date(a, 'Offer Accepted')))
            onboard = sum(1 for a in user_apps if (lambda d: bool(d and (not start_date or not end_date or (d >= start_date and d <= end_date)) and (a.modified_by and a.modified_by.lower() != 'system')))(get_status_transition_date(a, 'Placed')))

            user_metrics[email] = {
                'jobsCount': len(seen_jobs),
                'submissions': sub_count,
                'interviews': int_count,
                'offers': off_count,
                'offerAccepted': off_acc,
                'onboard': onboard,
                'jobCodes': list(seen_jobs)
            }

        return Response({
            'user_metrics': user_metrics,
            'start_date': start_date,
            'end_date': end_date
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


class CareerPortalApplicantPagination(PageNumberPagination):
    """Pagination for career portal applicants — prevents unbounded list responses."""
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'results': data
        })

class CareerPortalApplicantViewSet(viewsets.ModelViewSet):
    serializer_class = CareerPortalApplicantSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = CareerPortalApplicantPagination

    def get_queryset(self):
        from django.db.models import Q
        # Defer resume_embedding (VectorField 2048 floats = ~16 KB per row) — not needed in list responses.
        # Also defer job-level embedding fields to avoid loading large vectors unnecessarily.
        qs = CareerPortalApplicant.objects.select_related('job') \
        .defer(
            'resume_embedding',
            'job__ai_job_embedding', 'job__ai_job_embedding_nemotron',
            'job__ai_job_embedding_metadata', 'job__job_embedding'
        ) \
        .all().order_by('-created_at')

        job_id = self.request.query_params.get('job_id')
        if job_id:
            qs = qs.filter(job_id=job_id)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(mobile_number__icontains=search)
            )
        return qs

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        status_val = request.data.get('status')
        if status_val:
            instance.status = status_val
            user_display = getattr(request.user, 'full_name', None) or getattr(request.user, 'email', None) or 'System'
            instance.modified_by = user_display
            instance.save()
        return super().partial_update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        status_val = request.data.get('status')
        if status_val:
            instance.status = status_val
            user_display = getattr(request.user, 'full_name', None) or getattr(request.user, 'email', None) or 'System'
            instance.modified_by = user_display
            instance.save()
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        from users.models import Role
        if not (request.user.role == Role.ADMIN or request.user.is_superuser):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators can delete career portal applicants.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post', 'patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        applicant = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'Status is required'}, status=status.HTTP_400_BAD_REQUEST)
        applicant.status = new_status
        user_display = getattr(request.user, 'full_name', None) or getattr(request.user, 'email', None) or 'System'
        applicant.modified_by = user_display
        applicant.save()
        return Response(self.get_serializer(applicant).data)

    @action(detail=True, methods=['post'], url_path='import')
    def import_applicant(self, request, pk=None):
        applicant = self.get_object()

        if applicant.is_imported:
            return Response(
                {"error": "Candidate already imported into ATS."},
                status=status.HTTP_400_BAD_REQUEST
            )

        job = applicant.job
        full_name = f"{applicant.first_name} {applicant.last_name}".strip()

        # Extract parent job details from remarks
        def extract_remark(field_name):
            import re
            match = re.search(field_name + r':\s*(.*)', job.remarks or '')
            return match.group(1).strip() if match else ''

        job_code = extract_remark('Job Code')
        if not job_code or 'Auto Generated' in job_code:
            job_code = f"PPW - {job.id:04d}"

        # Resume filename
        resume_url = applicant.resume or ''
        filename = resume_url.split('/')[-1] if '/' in resume_url else (resume_url or 'Resume.pdf')

        formatted_remarks = f"""[Job Details]
Job Code: {job_code}
Client Bill Rate: {extract_remark('Client Bill Rate')}
Pay Rate: {extract_remark('Pay Rate')}
Start Date: {extract_remark('Start Date')}
End Date: {extract_remark('End Date')}
Location: {extract_remark('Location') or f"{job.city}, {job.state}"}
Job Status: Active
Job Type: {extract_remark('Job Type')}
Client Job ID: {extract_remark('Client Job ID')}
Required Documents: {extract_remark('Required Documents')}
Address: {extract_remark('Address')}
Work Mode: {extract_remark('Work Mode')}
Employee Type: {extract_remark('Employee Type')}
Zip Code: {extract_remark('Zip Code')}

[Skills & Candidate Info]
Qualification: {applicant.qualification}
Years of Experience: {applicant.years_of_experience}
Expected Pay: {applicant.expected_pay}
Primary Skills: {applicant.primary_skills}
Current CTC: {applicant.current_ctc}
Current Company: {applicant.current_company}
Accepted Terms: True

[Document Attachment]
Source Option: Career Portal
FileName: {filename}
Resume Link: {resume_url}"""

        recruiter_name = job.recruiter or (job.assigned_employee.full_name if job.assigned_employee else '')

        # Reuse existing ATS Application creation logic
        ats_app = Application.objects.create(
            candidate_name=full_name,
            candidate_email=applicant.email,
            candidate_phone=applicant.mobile_number,
            alternate_mobile_number=applicant.alternate_mobile_number,
            city=applicant.city,
            state=applicant.state,
            client_name=job.client_name,
            position=job.position,
            technology=job.technology,
            experience=applicant.years_of_experience,
            assigned_employee=job.assigned_employee,
            recruiter=recruiter_name,
            status='New',
            source='Company Career Portal',
            remarks=formatted_remarks
        )

        # Mark CareerPortalApplicant as imported
        applicant.is_imported = True
        applicant.imported_at = timezone.now()
        applicant.imported_by = getattr(request.user, 'full_name', '') or getattr(request.user, 'email', '')
        applicant.imported_application = ats_app
        applicant.save()

        return Response({
            "success": True,
            "message": "Candidate imported into ATS successfully.",
            "application_id": ats_app.id
        }, status=status.HTTP_200_OK)

