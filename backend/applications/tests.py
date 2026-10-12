from unittest.mock import MagicMock
from django.test import SimpleTestCase, RequestFactory
from rest_framework.request import Request
from applications.views import StandardResultsSetPagination, ApplicationViewSet, extract_job_code_fast
from users.models import Role


class MockQuerySet(list):
    def count(self):
        return len(self)

    @property
    def ordered(self):
        return True


class StandardResultsSetPaginationTests(SimpleTestCase):
    def setUp(self):
        self.pagination = StandardResultsSetPagination()
        self.factory = RequestFactory()

    def _create_drf_request(self, query_params=None):
        django_request = self.factory.get('/api/applications/', query_params or {})
        return Request(django_request)

    def _create_mock_queryset(self, count):
        return MockQuerySet(range(count))

    def test_default_request_uses_pagination(self):
        """Requests without all_records must use standard pagination."""
        request = self._create_drf_request({})
        qs = self._create_mock_queryset(100)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 50)  # default page_size is 50

    def test_unbounded_all_records_falls_back_to_pagination(self):
        """all_records=true without date/status/search filters must fall back to pagination."""
        request = self._create_drf_request({'all_records': 'true'})
        qs = self._create_mock_queryset(500)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 50)

    def test_bounded_all_records_below_ceiling_returns_unpaginated(self):
        """all_records=true with <= 2000 records returns None (unpaginated)."""
        request = self._create_drf_request({
            'all_records': 'true',
            'start_date': '2026-09-01',
            'end_date': '2026-09-10'
        })
        qs = self._create_mock_queryset(1500)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNone(result)

    def test_bounded_all_records_at_exact_ceiling_returns_unpaginated(self):
        """all_records=true with exactly 2000 records returns None (unpaginated)."""
        request = self._create_drf_request({
            'all_records': 'true',
            'start_date': '2026-09-01',
            'end_date': '2026-09-10'
        })
        qs = self._create_mock_queryset(2000)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNone(result)

    def test_bounded_all_records_above_ceiling_falls_back_to_pagination(self):
        """all_records=true with > 2000 records must fall back to standard pagination."""
        request = self._create_drf_request({
            'all_records': 'true',
            'start_date': '2026-08-31',
            'end_date': '2026-09-09'
        })
        qs = self._create_mock_queryset(7659)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 50)

    def test_status_placed_all_records_below_ceiling_returns_unpaginated(self):
        """all_records=true with status=Placed and <= 2000 records returns unpaginated."""
        request = self._create_drf_request({
            'all_records': 'true',
            'status': 'Placed'
        })
        qs = self._create_mock_queryset(100)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNone(result)

    def test_status_placed_all_records_above_ceiling_falls_back_to_pagination(self):
        """all_records=true with status=Placed and > 2000 records falls back to pagination."""
        request = self._create_drf_request({
            'all_records': 'true',
            'status': 'Placed'
        })
        qs = self._create_mock_queryset(2001)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 50)

    def test_global_search_all_records_below_ceiling_returns_unpaginated(self):
        """all_records=true with global_search and <= 2000 records returns unpaginated."""
        request = self._create_drf_request({
            'all_records': 'true',
            'global_search': 'developer'
        })
        qs = self._create_mock_queryset(50)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNone(result)

    def test_global_search_all_records_above_ceiling_falls_back_to_pagination(self):
        """all_records=true with global_search and > 2000 records falls back to pagination."""
        request = self._create_drf_request({
            'all_records': 'true',
            'global_search': 'developer'
        })
        qs = self._create_mock_queryset(2500)
        result = self.pagination.paginate_queryset(qs, request)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 50)


class ApplicationViewSetQuerysetOptimizationTests(SimpleTestCase):
    def test_status_notes_prefetch_includes_select_related_author(self):
        """Verify the status_notes prefetch queryset includes select_related('author')."""
        view = ApplicationViewSet()
        view.action = 'list'
        request = Request(RequestFactory().get('/api/applications/'))
        request.user = MagicMock(is_superuser=True)
        view.request = request

        qs = view.get_queryset()
        prefetch_lookups = qs._prefetch_related_lookups
        status_notes_prefetch = None
        for item in prefetch_lookups:
            if hasattr(item, 'to_attr') and item.to_attr == 'status_notes':
                status_notes_prefetch = item
                break

        self.assertIsNotNone(status_notes_prefetch, "status_notes prefetch must be present in list queryset")
        select_related_dict = status_notes_prefetch.queryset.query.select_related
        self.assertTrue(
            'author' in select_related_dict or ('author' in (select_related_dict or {})),
            f"Expected 'author' in select_related, got {select_related_dict}"
        )


class ReportingTeamPermissionTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _create_drf_request(self, method='POST', path='/api/applications/', user=None):
        if method == 'POST':
            req = self.factory.post(path)
        elif method == 'PUT':
            req = self.factory.put(path)
        elif method == 'PATCH':
            req = self.factory.patch(path)
        elif method == 'DELETE':
            req = self.factory.delete(path)
        else:
            req = self.factory.get(path)
        drf_req = Request(req)
        drf_req.user = user
        return drf_req

    def test_reporting_team_can_post_hierarchy_drilldown(self):
        """Authenticated REPORTING_TEAM users must be allowed to POST hierarchy_drilldown."""
        view = ApplicationViewSet()
        view.action = 'hierarchy_drilldown'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='POST', path='/api/applications/hierarchy-drilldown/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertTrue(has_perm, "REPORTING_TEAM must have permission to call hierarchy_drilldown via POST")

    def test_reporting_team_cannot_create_application(self):
        """REPORTING_TEAM users must be blocked from POST create applications."""
        view = ApplicationViewSet()
        view.action = 'create'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='POST', path='/api/applications/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to create applications")

    def test_reporting_team_cannot_update_application(self):
        """REPORTING_TEAM users must be blocked from PUT update applications."""
        view = ApplicationViewSet()
        view.action = 'update'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='PUT', path='/api/applications/1/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to update applications")

    def test_reporting_team_cannot_partial_update_application(self):
        """REPORTING_TEAM users must be blocked from PATCH partial_update applications."""
        view = ApplicationViewSet()
        view.action = 'partial_update'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='PATCH', path='/api/applications/1/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to patch applications")

    def test_reporting_team_cannot_delete_application(self):
        """REPORTING_TEAM users must be blocked from DELETE destroy applications."""
        view = ApplicationViewSet()
        view.action = 'destroy'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='DELETE', path='/api/applications/1/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to delete applications")

    def test_reporting_team_cannot_invoke_mutating_action_add_note(self):
        """REPORTING_TEAM users must be blocked from mutating custom actions like add_note."""
        view = ApplicationViewSet()
        view.action = 'add_note'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='POST', path='/api/applications/1/add-note/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to invoke add_note")

    def test_reporting_team_cannot_invoke_mutating_action_upload_resume(self):
        """REPORTING_TEAM users must be blocked from upload_resume."""
        view = ApplicationViewSet()
        view.action = 'upload_resume'
        user = MagicMock(is_authenticated=True, role=Role.REPORTING_TEAM)
        drf_req = self._create_drf_request(method='POST', path='/api/applications/upload-resume/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "REPORTING_TEAM must be denied permission to upload resumes")

    def test_unauthenticated_user_blocked_from_hierarchy_drilldown(self):
        """Unauthenticated requests must be blocked from hierarchy_drilldown."""
        view = ApplicationViewSet()
        view.action = 'hierarchy_drilldown'
        user = MagicMock(is_authenticated=False)
        drf_req = self._create_drf_request(method='POST', path='/api/applications/hierarchy-drilldown/', user=user)
        view.request = drf_req

        perms = view.get_permissions()
        has_perm = all(p.has_permission(drf_req, view) for p in perms)
        self.assertFalse(has_perm, "Unauthenticated users must be denied access to hierarchy_drilldown")

    def test_existing_roles_remain_permitted_for_hierarchy_drilldown(self):
        """All existing authorized recruitment roles must continue to have drill-down access."""
        authorized_roles = [
            Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.JUNIOR_MANAGER,
            Role.TEAM_LEAD, Role.SUB_LEAD, Role.ASSOCIATE_ANALYST, Role.SENIOR_ANALYST
        ]
        view = ApplicationViewSet()
        view.action = 'hierarchy_drilldown'
        for role in authorized_roles:
            user = MagicMock(is_authenticated=True, role=role)
            drf_req = self._create_drf_request(method='POST', path='/api/applications/hierarchy-drilldown/', user=user)
            view.request = drf_req
            perms = view.get_permissions()
            has_perm = all(p.has_permission(drf_req, view) for p in perms)
            self.assertTrue(has_perm, f"Role {role} must have permission to POST hierarchy_drilldown")


class JobCodeExtractionTests(SimpleTestCase):
    """Targeted regression tests for job-code parsing in extract_job_code_fast."""

    def test_single_line_job_code_extraction(self):
        """Single-line remarks with Job Code must be cleanly extracted."""
        self.assertEqual(extract_job_code_fast("Job Code: PPW - 1001"), "PPW - 1001")
        self.assertEqual(extract_job_code_fast("Job Code: PPW-2045"), "PPW-2045")
        self.assertEqual(extract_job_code_fast("Job Code: PPW_3000"), "PPW_3000")

    def test_multiline_remarks_with_additional_fields(self):
        """Multiline remarks must stop at the newline and not swallow subsequent fields."""
        remarks = (
            "Job Code: PPW-1001\n"
            "Bill Rate: 100\n"
            "Client: Acme Corporation\n"
            "Pay Rate: 80"
        )
        self.assertEqual(extract_job_code_fast(remarks), "PPW-1001")

    def test_windows_crlf_line_endings(self):
        """Remarks with Windows CRLF (\\r\\n) line endings must stop cleanly before \\r."""
        remarks = (
            "Job Code: PPW-1001\r\n"
            "Bill Rate: 100\r\n"
            "Client: Acme Corporation\r\n"
            "Pay Rate: 80"
        )
        self.assertEqual(extract_job_code_fast(remarks), "PPW-1001")

    def test_bare_carriage_return_line_endings(self):
        """Remarks with standalone \\r line endings must stop before \\r."""
        remarks = "Job Code: PPW-9876\rClient: Global Tech"
        self.assertEqual(extract_job_code_fast(remarks), "PPW-9876")

    def test_case_insensitive_job_code_prefix(self):
        """Job code prefix must be recognized case-insensitively."""
        remarks = "job code: PPW - 5555\nLocation: Remote"
        self.assertEqual(extract_job_code_fast(remarks), "PPW - 5555")

    def test_multiple_job_code_occurrences_skips_invalid(self):
        """If an initial 'Job Code:' is non-PPW or invalid, scan forward to find the valid PPW code."""
        remarks = "Job Code: N/A\nJob Code: PPW-8888\nOther notes"
        self.assertEqual(extract_job_code_fast(remarks), "PPW-8888")

    def test_invalid_or_missing_job_code_returns_na(self):
        """Remarks without valid PPW job code must return 'N/A'."""
        self.assertEqual(extract_job_code_fast(None), "N/A")
        self.assertEqual(extract_job_code_fast(""), "N/A")
        self.assertEqual(extract_job_code_fast("No code in this text"), "N/A")
        self.assertEqual(extract_job_code_fast("Job Code: 12345\nNotes"), "N/A")
        self.assertEqual(extract_job_code_fast("Job Code: NON_PPW\nNotes"), "N/A")


class JobCountConsistencyAndAggregationTests(SimpleTestCase):
    """
    Targeted regression tests for distinct Jobs Count aggregation and parity
    between hierarchy_stats and hierarchy_drilldown.
    """

    @staticmethod
    def _drilldown_extract_job_code(remarks):
        """Replicates hierarchy_drilldown's regex-based job code extraction."""
        import re
        if not remarks:
            return 'N/A'
        matches = re.finditer(r'^Job Code:[ \t]*(.*)$', remarks, re.M | re.I)
        for match in matches:
            val = match.group(1).strip()
            if val and val.upper().startswith('PPW'):
                return val
        return 'N/A'

    def test_sibling_records_differing_remarks_count_as_single_job(self):
        """
        Two records sharing the same job code but containing different multiline remarks
        must be extracted to the identical job code and counted as exactly 1 distinct job.
        """
        record_1_remarks = (
            "Job Code: PPW-1001\n"
            "Bill Rate: 100\n"
            "Client: Acme Corp\n"
            "Recruiter: Alice"
        )
        record_2_remarks = (
            "Job Code: PPW-1001\n"
            "Bill Rate: 110\n"
            "Client: Acme Corp\n"
            "Recruiter: Alice\n"
            "Candidate Interview scheduled for tomorrow"
        )

        code_1 = extract_job_code_fast(record_1_remarks)
        code_2 = extract_job_code_fast(record_2_remarks)

        self.assertEqual(code_1, "PPW-1001")
        self.assertEqual(code_2, "PPW-1001")

        # In hierarchy_stats aggregation:
        seen_jobs = set()
        seen_jobs.add(code_1.upper().strip())
        seen_jobs.add(code_2.upper().strip())

        self.assertEqual(len(seen_jobs), 1, "Two records for the same job must produce distinct Jobs Count of 1")

    def test_distinct_jobs_count_aggregation(self):
        """
        Multiple records across different job codes (with mixed CRLF/LF line endings
        and differing remarks) must aggregate to the exact distinct job count.
        """
        records_remarks = [
            "Job Code: PPW-0001\r\nClient: Acme\r\nRate: 50",
            "Job Code: PPW-0001\nClient: Acme\nRate: 55\nNote: Second candidate",
            "Job Code: PPW-0002\nClient: Beta\nRate: 60",
            "Job Code: PPW-0002\r\nClient: Beta\r\nRate: 65",
            "Job Code: PPW-0003\nClient: Gamma\nRate: 70",
        ]

        seen_jobs = set()
        for rem in records_remarks:
            code = extract_job_code_fast(rem)
            if code != 'N/A':
                seen_jobs.add(code.upper().strip())

        self.assertEqual(len(seen_jobs), 3)
        self.assertEqual(seen_jobs, {"PPW-0001", "PPW-0002", "PPW-0003"})

    def test_stats_and_drilldown_extraction_parity(self):
        """
        extract_job_code_fast (hierarchy_stats) and regex extraction (hierarchy_drilldown)
        must produce identical job codes across varied test cases.
        """
        test_cases = [
            "Job Code: PPW-1001",
            "Job Code: PPW-1001\nBill Rate: 100\nClient: Acme",
            "Job Code: PPW-1001\r\nBill Rate: 100\r\nClient: Acme",
            "Job Code: PPW - 2002\nDate: 2026-10-12",
            "Job Code: PPW - 2002\r\nDate: 2026-10-12",
            "Job Code: N/A\nJob Code: PPW-3003\nClient: TechCorp",
            "No code here\nOnly notes",
            "",
            None,
        ]

        for remarks in test_cases:
            stats_code = extract_job_code_fast(remarks)
            drilldown_code = self._drilldown_extract_job_code(remarks)
            self.assertEqual(
                stats_code,
                drilldown_code,
                f"Mismatch between stats and drill-down extraction for remarks: {remarks!r}"
            )


class RoleBasedVisibilityTests(SimpleTestCase):
    """
    Tests ensuring existing role-based visibility restrictions on ApplicationViewSet.get_queryset().
    """

    def setUp(self):
        self.factory = RequestFactory()

    def _create_view_with_user(self, user):
        view = ApplicationViewSet()
        view.action = 'list'
        req = Request(self.factory.get('/api/applications/'))
        req.user = user
        view.request = req
        return view

    def test_admin_and_management_have_unrestricted_visibility(self):
        """ADMIN, CEO, SENIOR_MANAGER, and REPORTING_TEAM have unrestricted queryset (no WHERE filter)."""
        for role in [Role.ADMIN, Role.CEO, Role.SENIOR_MANAGER, Role.REPORTING_TEAM]:
            user = MagicMock(is_superuser=False, role=role)
            view = self._create_view_with_user(user)
            qs = view.get_queryset()
            self.assertNotIn('WHERE', str(qs.query).upper())

    def test_recruiter_roles_have_restricted_visibility(self):
        """ASSOCIATE_ANALYST and SENIOR_ANALYST are restricted to their own applications in WHERE clause."""
        for role in [Role.ASSOCIATE_ANALYST, Role.SENIOR_ANALYST]:
            user = MagicMock(is_superuser=False, role=role, full_name="Test User", email="test@example.com")
            view = self._create_view_with_user(user)
            qs = view.get_queryset()
            self.assertIn('WHERE', str(qs.query).upper())

    def test_unauthenticated_or_unknown_role_gets_empty_queryset(self):
        """Users with unrecognized roles get an empty queryset (is_empty() is True)."""
        user = MagicMock(is_superuser=False, role="UNKNOWN_ROLE")
        view = self._create_view_with_user(user)
        qs = view.get_queryset()
        self.assertTrue(qs.query.is_empty())
