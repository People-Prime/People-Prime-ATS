"""
Targeted Regression Test Suite for ApplicationViewSet Queryset Optimization.

Validates:
1. RBAC visibility and record ID parity for all user roles:
   - ADMIN, CEO, SENIOR_MANAGER, REPORTING_TEAM
   - JUNIOR_MANAGER
   - TEAM_LEAD, SUB_LEAD (direct and indirect reporting relationships)
   - ASSOCIATE_ANALYST, SENIOR_ANALYST
2. Team-based application filtering and multi-team assigned users (no duplicates).
3. Date range filtering and Exists() status-transition Note subquery (no duplicates).
4. Multiple status-transition notes for a single candidate outside creation window.
5. Dashboard creation-date-only filtering (all_applicants=true).
6. Global search, status filtering, and is_job_posting filtering.
7. Pagination totals and clean COUNT(*) SQL generation without DISTINCT subqueries.
"""

from datetime import datetime, date
from django.test import TestCase, RequestFactory
from django.utils import timezone
from rest_framework.request import Request
from rest_framework import status

from applications.models import Application, Note
from teams.models import Team
from users.models import User, Role
from applications.views import ApplicationViewSet, StandardResultsSetPagination


class ApplicationViewSetQuerysetOptimizationRegressionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Create Teams
        cls.team_a = Team.objects.create(name="Team Alpha")
        cls.team_b = Team.objects.create(name="Team Beta")

        # 2. Create Users across all roles
        cls.admin = User.objects.create(
            email="admin@test.com", full_name="Admin User", role=Role.ADMIN, is_active=True
        )
        cls.ceo = User.objects.create(
            email="ceo@test.com", full_name="CEO User", role=Role.CEO, is_active=True
        )
        cls.sr_manager = User.objects.create(
            email="srmgr@test.com", full_name="Senior Manager", role=Role.SENIOR_MANAGER, is_active=True
        )
        cls.reporting_team = User.objects.create(
            email="reporting@test.com", full_name="Reporting Member", role=Role.REPORTING_TEAM, is_active=True
        )
        cls.jr_manager = User.objects.create(
            email="jrmgr@test.com", full_name="Junior Manager", role=Role.JUNIOR_MANAGER, is_active=True
        )
        cls.lead = User.objects.create(
            email="lead@test.com", full_name="Team Lead", role=Role.TEAM_LEAD, is_active=True
        )
        cls.sub_lead = User.objects.create(
            email="sublead@test.com", full_name="Sub Lead", role=Role.SUB_LEAD, is_active=True
        )
        cls.sr_analyst = User.objects.create(
            email="sranalyst@test.com", full_name="Senior Analyst", role=Role.SENIOR_ANALYST, is_active=True
        )
        cls.analyst1 = User.objects.create(
            email="analyst1@test.com", full_name="Analyst One", role=Role.ASSOCIATE_ANALYST, is_active=True
        )
        cls.analyst2 = User.objects.create(
            email="analyst2@test.com", full_name="Analyst Two", role=Role.ASSOCIATE_ANALYST, is_active=True
        )

        # 3. Configure Reporting Hierarchy
        # jr_manager -> lead -> sub_lead -> analyst1
        # Also direct lead -> analyst2
        cls.lead.reporting_to.add(cls.jr_manager)
        cls.sub_lead.reporting_to.add(cls.lead)
        cls.analyst1.reporting_to.add(cls.sub_lead)  # Indirect reporter to lead & jr_manager
        cls.analyst2.reporting_to.add(cls.lead)      # Direct reporter to lead, indirect to jr_manager

        # 4. Configure Multi-Team Membership
        # analyst1 is in BOTH Team Alpha and Team Beta
        cls.analyst1.teams.add(cls.team_a, cls.team_b)
        # analyst2 is in Team Alpha only
        cls.analyst2.teams.add(cls.team_a)
        # lead is in Team Alpha
        cls.lead.teams.add(cls.team_a)

        # 5. Create Applications
        # Job 1 (Parent job posting): assigned to lead, Team Alpha
        cls.job1 = Application.objects.create(
            candidate_name="",
            position="Senior Python Developer",
            client_name="Acme Corp",
            technology="Python, Django",
            experience=5.0,
            assigned_employee=cls.lead,
            recruiter=cls.lead.email,
            status="New",
            remarks="Job Code: PPW-1001",
        )
        Application.objects.filter(id=cls.job1.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 1, 10, 0, 0))
        )
        cls.job1.refresh_from_db()

        # Job 2 (Parent job posting): assigned to analyst1 (multi-team member)
        cls.job2 = Application.objects.create(
            candidate_name="",
            position="React Frontend Engineer",
            client_name="Beta Corp",
            technology="React, TypeScript",
            experience=3.0,
            assigned_employee=cls.analyst1,
            recruiter=cls.analyst1.email,
            status="New",
            remarks="Job Code: PPW-1002",
        )
        Application.objects.filter(id=cls.job2.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 2, 10, 0, 0))
        )
        cls.job2.refresh_from_db()

        # Candidate 1: assigned to analyst1, created in August
        cls.cand1 = Application.objects.create(
            candidate_name="Alice Smith",
            candidate_email="alice@example.com",
            candidate_phone="9876543210",
            position="React Frontend Engineer",
            client_name="Beta Corp",
            technology="React",
            experience=3.0,
            assigned_employee=cls.analyst1,
            recruiter=cls.analyst1.full_name,
            status="Submitted",
            remarks="Job Code: PPW-1002",
        )
        Application.objects.filter(id=cls.cand1.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 5, 10, 0, 0))
        )
        cls.cand1.refresh_from_db()

        # Candidate 2: assigned to analyst2, created in August
        cls.cand2 = Application.objects.create(
            candidate_name="Bob Jones",
            candidate_email="bob@example.com",
            candidate_phone="9876543211",
            position="Senior Python Developer",
            client_name="Acme Corp",
            technology="Python",
            experience=5.0,
            assigned_employee=cls.analyst2,
            recruiter=cls.analyst2.email,
            status="Submitted",
            remarks="Job Code: PPW-1001",
        )
        Application.objects.filter(id=cls.cand2.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 15, 10, 0, 0))
        )
        cls.cand2.refresh_from_db()

        # Candidate 3: assigned to sub_lead, CREATED IN JULY (outside August date range).
        # Has multiple status transition notes in August!
        cls.cand3 = Application.objects.create(
            candidate_name="Charlie Brown",
            candidate_email="charlie@example.com",
            candidate_phone="9876543212",
            position="Senior Python Developer",
            client_name="Acme Corp",
            technology="Python",
            experience=6.0,
            assigned_employee=cls.sub_lead,
            recruiter=cls.sub_lead.email,
            status="Interview Scheduled",
            remarks="Job Code: PPW-1001",
        )
        # Created on 2026-07-01
        Application.objects.filter(id=cls.cand3.id).update(
            created_at=timezone.make_aware(datetime(2026, 7, 1, 10, 0, 0))
        )
        cls.cand3.refresh_from_db()

        # Create multiple status transition notes for Candidate 3 within August 2026
        cls.note1 = Note.objects.create(
            application=cls.cand3,
            author=cls.admin,
            content="Status updated to Submitted.",
        )
        Note.objects.filter(id=cls.note1.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 5, 11, 0, 0))
        )

        cls.note2 = Note.objects.create(
            application=cls.cand3,
            author=cls.admin,
            content="Status updated to Interview Scheduled.",
        )
        Note.objects.filter(id=cls.note2.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 10, 14, 0, 0))
        )

        cls.note3 = Note.objects.create(
            application=cls.cand3,
            author=cls.admin,
            content="Status updated to Interview Scheduled.\nComment: Round 2 with VP",
        )
        Note.objects.filter(id=cls.note3.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 12, 16, 0, 0))
        )

        # Candidate 4: assigned to admin, created in August
        cls.cand4 = Application.objects.create(
            candidate_name="Dana White",
            candidate_email="dana@example.com",
            candidate_phone="9876543213",
            position="DevOps Engineer",
            client_name="Gamma Cloud",
            technology="Kubernetes, AWS",
            experience=4.0,
            assigned_employee=cls.admin,
            recruiter=cls.admin.email,
            status="New",
            remarks="Job Code: PPW-1003",
        )
        Application.objects.filter(id=cls.cand4.id).update(
            created_at=timezone.make_aware(datetime(2026, 8, 20, 10, 0, 0))
        )
        cls.cand4.refresh_from_db()

        cls.test_ids = {
            cls.job1.id, cls.job2.id, cls.cand1.id, cls.cand2.id, cls.cand3.id, cls.cand4.id
        }

    def setUp(self):
        self.factory = RequestFactory()

    def _get_view(self, user, query_params=None, action="list"):
        view = ApplicationViewSet()
        view.action = action
        django_req = self.factory.get("/api/applications/", query_params or {})
        drf_req = Request(django_req)
        drf_req._user = user
        view.request = drf_req
        return view

    # -------------------------------------------------------------
    # 1. RBAC Visibility & Hierarchy Parity Tests
    # -------------------------------------------------------------
    def test_admin_and_management_roles_see_all_records(self):
        """Admin, CEO, Senior Manager, and Reporting Team see all test applications without duplicates."""
        for user in [self.admin, self.ceo, self.sr_manager, self.reporting_team]:
            view = self._get_view(user)
            qs = view.get_queryset()
            ids = list(qs.values_list("id", flat=True))
            matching_test_ids = [i for i in ids if i in self.test_ids]
            self.assertEqual(len(matching_test_ids), 6)
            self.assertEqual(len(matching_test_ids), len(set(matching_test_ids)), f"Duplicate IDs detected for role {user.role}")
            self.assertEqual(set(matching_test_ids), self.test_ids)

    def test_junior_manager_sees_reporters_and_own_applications(self):
        """
        Junior Manager sees self + direct reporters (lead) + 2nd-level reporters (sub_lead, analyst2).
        analyst1 is 3 levels deep (lead -> sub_lead -> analyst1), so analyst1's apps are not visible
        under the 2-level reporting hierarchy filter.
        """
        view = self._get_view(self.jr_manager)
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))
        matching_test_ids = [i for i in ids if i in self.test_ids]
        # Expected: job1 (lead), cand2 (analyst2), cand3 (sub_lead)
        expected = {self.job1.id, self.cand2.id, self.cand3.id}
        self.assertEqual(set(matching_test_ids), expected)
        self.assertEqual(len(matching_test_ids), len(set(matching_test_ids)), "Duplicate IDs detected for Junior Manager")
        self.assertNotIn(self.cand4.id, matching_test_ids)

    def test_team_lead_sees_direct_and_indirect_reporters_without_duplicates(self):
        """Team Lead sees self + sub_lead (direct) + analyst2 (direct) + analyst1 (indirect)."""
        view = self._get_view(self.lead)
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))
        # Expected: job1 (self), job2 (analyst1), cand1 (analyst1), cand2 (analyst2), cand3 (sub_lead)
        # Not cand4 (admin)
        self.assertEqual(len(ids), 5)
        self.assertEqual(len(ids), len(set(ids)), "Duplicate IDs detected for Team Lead")
        self.assertNotIn(self.cand4.id, ids)
        self.assertEqual(qs.count(), 5)

    def test_sub_lead_sees_analyst1_and_own_applications(self):
        """Sub Lead sees self and analyst1 (direct reporter), but not lead, analyst2, or admin."""
        view = self._get_view(self.sub_lead)
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))
        # Expected: job2 (analyst1), cand1 (analyst1), cand3 (sub_lead)
        expected_ids = {self.job2.id, self.cand1.id, self.cand3.id}
        self.assertEqual(set(ids), expected_ids)
        self.assertEqual(len(ids), len(set(ids)), "Duplicate IDs detected for Sub Lead")
        self.assertEqual(qs.count(), 3)

    def test_analyst_sees_only_assigned_or_recruiter_applications(self):
        """Associate Analyst and Senior Analyst see strictly applications where assigned or recruiter."""
        # analyst1
        view1 = self._get_view(self.analyst1)
        qs1 = view1.get_queryset()
        ids1 = list(qs1.values_list("id", flat=True))
        self.assertEqual(set(ids1), {self.job2.id, self.cand1.id})
        self.assertEqual(len(ids1), len(set(ids1)), "Duplicate IDs detected for Analyst1")
        self.assertEqual(qs1.count(), 2)

        # analyst2
        view2 = self._get_view(self.analyst2)
        qs2 = view2.get_queryset()
        ids2 = list(qs2.values_list("id", flat=True))
        self.assertEqual(set(ids2), {self.cand2.id})
        self.assertEqual(len(ids2), 1)
        self.assertEqual(qs2.count(), 1)

    # -------------------------------------------------------------
    # 2. Team-Based Filtering & Multi-Team Membership Tests
    # -------------------------------------------------------------
    def test_team_filtering_with_multi_team_user_produces_no_duplicates(self):
        """
        Analyst1 belongs to both Team Alpha and Team Beta.
        Filtering by team_id=team_a must return applications assigned to Team Alpha members
        without duplicating any rows.
        """
        # Admin querying Team Alpha
        view = self._get_view(self.admin, {"team_id": str(self.team_a.id)})
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))

        # Assigned to Team Alpha members:
        # lead: job1
        # analyst1: job2, cand1
        # analyst2: cand2
        # Total: 4
        expected_ids = {self.job1.id, self.job2.id, self.cand1.id, self.cand2.id}
        self.assertEqual(set(ids), expected_ids)
        self.assertEqual(len(ids), len(set(ids)), "Multi-team user join produced duplicate records!")
        self.assertEqual(qs.count(), 4)

        # Admin querying Team Beta (only analyst1 is in Team Beta)
        view_b = self._get_view(self.admin, {"team_id": str(self.team_b.id)})
        qs_b = view_b.get_queryset()
        ids_b = list(qs_b.values_list("id", flat=True))
        expected_ids_b = {self.job2.id, self.cand1.id}
        self.assertEqual(set(ids_b), expected_ids_b)
        self.assertEqual(len(ids_b), len(set(ids_b)), "Team Beta query produced duplicate records!")
        self.assertEqual(qs_b.count(), 2)

    # -------------------------------------------------------------
    # 3. Date Filtering & Status Transition Note Subquery Tests
    # -------------------------------------------------------------
    def test_applicants_page_date_range_includes_candidate_with_status_transitions_without_duplicates(self):
        """
        Candidate 3 was created in July, but has 3 status transition notes in August.
        Applicants page date filter (August 1 to August 31, all_applicants omitted) MUST:
        1. Include Candidate 3.
        2. Return Candidate 3 EXACTLY ONCE despite having 3 matching Note records.
        """
        params = {
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        }
        view = self._get_view(self.admin, params)
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))

        # Expected in August:
        # Created in August: job1, job2, cand1, cand2, cand4
        # Created in July but has August transition notes: cand3
        # Total: all 6
        self.assertEqual(len(ids), 6)
        self.assertEqual(len(ids), len(set(ids)), "Multiple transition notes produced duplicate rows!")
        self.assertIn(self.cand3.id, ids)
        self.assertEqual(qs.count(), 6)

    def test_dashboard_all_applicants_strict_creation_date_filtering(self):
        """
        Dashboard (all_applicants=true) MUST strictly filter by creation date.
        Candidate 3 (created in July) MUST be excluded from August dashboard count,
        even though it had 3 status notes in August.
        """
        params = {
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "all_applicants": "true",
        }
        view = self._get_view(self.admin, params)
        qs = view.get_queryset()
        ids = list(qs.values_list("id", flat=True))

        # Only records created in August: job1, job2, cand1, cand2, cand4 (5 records)
        # cand3 (created in July) must NOT be present
        self.assertNotIn(self.cand3.id, ids)
        self.assertEqual(len(ids), 5)
        self.assertEqual(qs.count(), 5)

    # -------------------------------------------------------------
    # 4. Global Search, Status, and Job Posting Filter Tests
    # -------------------------------------------------------------
    def test_is_job_posting_filter(self):
        """is_job_posting=true returns only jobs (candidate_name=''); false returns candidates."""
        view_jobs = self._get_view(self.admin, {"is_job_posting": "true"})
        job_ids = list(view_jobs.get_queryset().values_list("id", flat=True))
        self.assertEqual(set(job_ids), {self.job1.id, self.job2.id})
        self.assertEqual(view_jobs.get_queryset().count(), 2)

        view_cands = self._get_view(self.admin, {"is_job_posting": "false"})
        cand_ids = list(view_cands.get_queryset().values_list("id", flat=True))
        self.assertEqual(set(cand_ids), {self.cand1.id, self.cand2.id, self.cand3.id, self.cand4.id})
        self.assertEqual(view_cands.get_queryset().count(), 4)

    def test_global_search_filter(self):
        """global_search matches across candidate_name, email, technology, and remarks without duplicates."""
        # Search for 'python' (matches job1, cand2, cand3)
        view = self._get_view(self.admin, {"global_search": "python"})
        ids = list(view.get_queryset().values_list("id", flat=True))
        self.assertEqual(set(ids), {self.job1.id, self.cand2.id, self.cand3.id})
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(view.get_queryset().count(), 3)

        # Search for exact ID of cand1
        view_id = self._get_view(self.admin, {"global_search": str(self.cand1.id)})
        ids_id = list(view_id.get_queryset().values_list("id", flat=True))
        self.assertEqual(ids_id, [self.cand1.id])
        self.assertEqual(view_id.get_queryset().count(), 1)

    def test_status_filter(self):
        """status filter accurately restricts queryset."""
        view_sub = self._get_view(self.admin, {"status": "Submitted"})
        ids_sub = [i for i in view_sub.get_queryset().values_list("id", flat=True) if i in self.test_ids]
        # cand1, cand2, and cand4 (auto-transitioned from New) are Submitted
        self.assertEqual(set(ids_sub), {self.cand1.id, self.cand2.id, self.cand4.id})

        view_int = self._get_view(self.admin, {"status": "INTERVIEWS"})
        ids_int = [i for i in view_int.get_queryset().values_list("id", flat=True) if i in self.test_ids]
        self.assertEqual(ids_int, [self.cand3.id])

    # -------------------------------------------------------------
    # 5. SQL Compilation & Count Optimization Assertions
    # -------------------------------------------------------------
    def test_queryset_count_generates_clean_sql_without_distinct_subquery(self):
        """
        Verify that qs.count() on date-filtered normal Applicants query produces:
        SELECT COUNT(*) AS "__count" FROM "applications_application" WHERE ...
        without:
        - DISTINCT
        - Subquery wrapper
        - ORDER BY clause
        - LEFT OUTER JOIN users_user
        """
        params = {
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
        }
        view = self._get_view(self.admin, params)
        qs = view.get_queryset()

        # The queryset distinct flag must be False
        self.assertFalse(qs.query.distinct, "QuerySet has distinct=True, causing expensive subquery wrapping!")

        # Capture count SQL
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            total = qs.count()

        self.assertEqual(total, 6)
        self.assertEqual(len(ctx.captured_queries), 1)

        count_sql = ctx.captured_queries[0]["sql"]
        upper_sql = count_sql.upper()

        # Assert no SELECT DISTINCT
        self.assertNotIn("SELECT DISTINCT", upper_sql, "COUNT query contains SELECT DISTINCT!")

        # Assert no subquery wrapper
        self.assertNotIn("FROM (SELECT", upper_sql, "COUNT query wrapped in an expensive subquery!")

        # Assert no ORDER BY
        self.assertNotIn("ORDER BY", upper_sql, "COUNT query retains unnecessary ORDER BY clause!")

        # Assert no outer join to users_user
        self.assertNotIn("LEFT OUTER JOIN \"USERS_USER\"", upper_sql)
        self.assertNotIn("JOIN \"USERS_USER\"", upper_sql)

    # -------------------------------------------------------------
    # 6. Pagination Integration Tests
    # -------------------------------------------------------------
    def test_pagination_count_parity_and_response_contract(self):
        """StandardResultsSetPagination returns identical count and results."""
        paginator = StandardResultsSetPagination()
        view = self._get_view(self.admin, {"start_date": "2026-08-01", "end_date": "2026-08-31"})
        qs = view.get_queryset()

        page = paginator.paginate_queryset(qs, view.request, view=view)
        resp = paginator.get_paginated_response([app.id for app in page])

        self.assertEqual(resp.data["count"], 6)
        self.assertEqual(len(resp.data["results"]), 6)
        self.assertEqual(set(resp.data["results"]), {
            self.job1.id, self.job2.id, self.cand1.id, self.cand2.id, self.cand3.id, self.cand4.id
        })
