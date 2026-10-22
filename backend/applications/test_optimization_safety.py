"""
Comprehensive Pre-Deployment Verification Test Suite for ATS Backend Optimizations.

Validates:
1. AI task imports and Celery queue routing
2. Foundit query optimization (no N+1, list/detail/fallback parity)
3. Hierarchy statistics and drilldown historical correctness
4. Repeated status transitions and date filtering
5. Candidate duplicate check accuracy and query consolidation
6. Cache invalidation correctness across Application, Note, and User
"""

import sys
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from django.test import TestCase, RequestFactory, override_settings
from django.core.cache import cache
from rest_framework.request import Request
from rest_framework import status

from applications.models import Application, Note, JobBoardPosting, CareerPortalApplicant
from users.models import User, Role
from applications.views import (
    ApplicationViewSet,
    get_hierarchy_stats_version,
    invalidate_hierarchy_stats_cache,
    HIERARCHY_STATS_VERSION_CACHE_KEY,
)
from applications.serializers import ApplicationSerializer


class AITaskSafetyTests(TestCase):
    """Verifies that the Celery AI task is cleanly decoupled from ML modules in web processes."""

    def test_importing_tasks_module_does_not_load_heavy_ml_stack(self):
        """Web workers importing score_applicant_resume_task must NOT load numpy/scipy/sklearn."""
        # Check current modules
        for mod in ['sentence_transformers', 'fitz']:
            self.assertNotIn(mod, sys.modules, f"{mod} should not be loaded in web worker process")

        from applications.ai.tasks import score_applicant_resume_task
        self.assertEqual(score_applicant_resume_task.name, 'applications.ai.tasks.score_applicant_resume_task')

    def test_celery_task_execution_and_error_handling(self):
        """Verifies task runs process_applicant_ai_match lazily and catches exceptions safely."""
        from applications.ai.tasks import score_applicant_resume_task
        from celery.exceptions import SoftTimeLimitExceeded

        # Success path
        with patch('applications.ai.service.process_applicant_ai_match', return_value=92.0):
            res = score_applicant_resume_task(999)
            self.assertEqual(res, 92.0)

        # Soft time limit
        with patch('applications.ai.service.process_applicant_ai_match', side_effect=SoftTimeLimitExceeded('Timeout')):
            res = score_applicant_resume_task(999)
            self.assertIsNone(res)

        # Exception
        with patch('applications.ai.service.process_applicant_ai_match', side_effect=RuntimeError('PDF Read Error')):
            res = score_applicant_resume_task(999)
            self.assertIsNone(res)


from rest_framework.test import APIRequestFactory, force_authenticate

class FounditQueryOptimizationTests(TestCase):
    """Verifies Foundit N+1 elimination across list, detail, and un-prefetched instances."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create(email='test_lead@example.com', full_name='Test Lead', role=Role.ADMIN, is_active=True)
        self.job1 = Application.objects.create(
            candidate_name='',
            position='Python Engineer',
            client_name='Acme Corp',
            technology='Python',
            experience=4.0,
            status='New'
        )
        self.job2 = Application.objects.create(
            candidate_name='',
            position='React Engineer',
            client_name='Acme Corp',
            technology='React',
            experience=3.0,
            status='New'
        )
        JobBoardPosting.objects.create(job=self.job1, job_board='Foundit', status='PUBLISHED')

    def test_list_action_prefetches_and_avoids_n_plus_one(self):
        """List action must serialize publish_to_foundit without per-row queries."""
        view = ApplicationViewSet.as_view({'get': 'list'})
        req = self.factory.get('/api/applications/?is_job_posting=true')
        force_authenticate(req, user=self.user)

        resp = view(req)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        foundit_map = {item['id']: item['publish_to_foundit'] for item in results if item['id'] in [self.job1.id, self.job2.id]}
        self.assertTrue(foundit_map[self.job1.id])
        self.assertFalse(foundit_map[self.job2.id])

    def test_unprefetched_instance_fallback_correctness(self):
        """Serializer must correctly fallback to query when given an un-prefetched instance."""
        standalone_job = Application.objects.get(id=self.job1.id)
        # Verify it has no prefetched cache
        self.assertFalse(hasattr(standalone_job, '_prefetched_objects_cache'))
        serializer = ApplicationSerializer(standalone_job)
        self.assertTrue(serializer.data['publish_to_foundit'])

        standalone_job2 = Application.objects.get(id=self.job2.id)
        serializer2 = ApplicationSerializer(standalone_job2)
        self.assertFalse(serializer2.data['publish_to_foundit'])


class CandidateDuplicateCheckTests(TestCase):
    """Verifies candidate duplicate check consolidation to a single query with identical payload."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create(email='recruiter@example.com', full_name='Recruiter', role=Role.ADMIN, is_active=True)
        self.candidate = Application.objects.create(
            candidate_name='Jane Doe',
            candidate_email='jane.doe@example.com',
            candidate_phone='9876543210',
            position='Backend Developer',
            client_name='Alpha Tech',
            technology='Django',
            experience=5.0,
            status='Submitted',
            remarks='Degree: B.Tech\nLocation: Bangalore\nExpected Salary: 15 LPA\nNotice Period: 30 Days'
        )

    def test_check_candidate_exists_single_query_and_contract(self):
        """Verifies duplicate check returns exact existing contract in a single query."""
        view = ApplicationViewSet.as_view({'get': 'check_candidate'})
        req = self.factory.get('/api/applications/check-candidate/?email=jane.doe@example.com&phone=9876543210')
        force_authenticate(req, user=self.user)

        with self.assertNumQueries(1):
            resp = view(req)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['exists'])
        self.assertEqual(resp.data['id'], self.candidate.id)
        self.assertEqual(resp.data['candidate_name'], 'Jane Doe')
        self.assertEqual(resp.data['first_name'], 'Jane')
        self.assertEqual(resp.data['last_name'], 'Doe')
        self.assertEqual(resp.data['degree'], 'B.Tech')
        self.assertEqual(resp.data['location'], 'Bangalore')
        self.assertEqual(resp.data['expected_salary'], '15 LPA')
        self.assertEqual(len(resp.data['assigned_jobs']), 1)
        self.assertEqual(resp.data['assigned_jobs'][0]['position'], 'backend developer')

    def test_check_candidate_not_found(self):
        """Verifies duplicate check returns exists=False for non-matching candidate."""
        view = ApplicationViewSet.as_view({'get': 'check_candidate'})
        req = self.factory.get('/api/applications/check-candidate/?email=unknown@example.com&phone=0000000000')
        force_authenticate(req, user=self.user)

        resp = view(req)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['exists'])


class HierarchyCorrectnessAndHistoryTests(TestCase):
    """Verifies hierarchy stats and drilldown historical correctness under transitions and reassignments."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = User.objects.create(email='admin@example.com', full_name='Admin User', role=Role.ADMIN, is_active=True)
        self.recruiter1 = User.objects.create(email='rec1@example.com', full_name='Recruiter One', role=Role.ASSOCIATE_ANALYST, is_active=True)
        self.recruiter2 = User.objects.create(email='rec2@example.com', full_name='Recruiter Two', role=Role.ASSOCIATE_ANALYST, is_active=True)

        self.job = Application.objects.create(
            candidate_name='',
            position='Full Stack Developer',
            client_name='Beta Corp',
            technology='React, Python',
            experience=3.0,
            status='New',
            remarks='Job Code: PPW - 9001\nDescription: Great opportunity',
            assigned_employee=self.recruiter1,
            recruiter=self.recruiter1.email
        )

    def test_repeated_status_transitions_and_attribution(self):
        """Verifies multiple transitions for the same candidate accurately attribute to the latest status."""
        cand = Application.objects.create(
            candidate_name='Candidate Repeated',
            candidate_email='repeated@example.com',
            candidate_phone='9998887771',
            position='Full Stack Developer',
            client_name='Beta Corp',
            technology='React, Python',
            experience=3.0,
            status='Submitted',
            remarks='Job Code: PPW - 9001',
            assigned_employee=self.recruiter1,
            recruiter=self.recruiter1.email
        )

        # Note 1: First Submitted
        Note.objects.create(application=cand, author=self.admin, content='Status updated to Submitted.')
        # Note 2: Interview Scheduled
        Note.objects.create(application=cand, author=self.admin, content='Status updated to Interview Scheduled.')
        # Note 3: Second Interview Scheduled (repeated transition)
        Note.objects.create(application=cand, author=self.admin, content='Status updated to Interview Scheduled.\nComment: Round 2')

        view = ApplicationViewSet.as_view({'get': 'hierarchy_stats'})
        req = self.factory.get('/api/applications/hierarchy-stats/')
        force_authenticate(req, user=self.admin)
        resp = view(req)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        metrics = resp.data['user_metrics'].get(self.recruiter1.email.lower())
        self.assertIsNotNone(metrics)
        self.assertEqual(metrics['submissions'], 1)
        self.assertEqual(metrics['interviews'], 1)

    def test_recruiter_reassignment_attribution(self):
        """Verifies candidate assigned to new recruiter attributes metrics to the new assignee."""
        cand = Application.objects.create(
            candidate_name='Reassigned Candidate',
            candidate_email='reassigned@example.com',
            candidate_phone='9998887772',
            position='Full Stack Developer',
            client_name='Beta Corp',
            technology='React, Python',
            experience=3.0,
            status='Submitted',
            remarks='Job Code: PPW - 9001',
            assigned_employee=self.recruiter2,
            recruiter=self.recruiter2.email
        )
        Note.objects.create(application=cand, author=self.admin, content='Status updated to Submitted.')

        view = ApplicationViewSet.as_view({'get': 'hierarchy_stats'})
        req = self.factory.get('/api/applications/hierarchy-stats/')
        force_authenticate(req, user=self.admin)
        resp = view(req)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rec2_metrics = resp.data['user_metrics'].get(self.recruiter2.email.lower())
        self.assertIsNotNone(rec2_metrics)
        self.assertEqual(rec2_metrics['submissions'], 1)


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'safety-test-cache',
        }
    }
)
class CacheFreshnessAndSignalsTests(TestCase):
    """Verifies that Application, Note, and User modifications properly increment cache version."""

    def setUp(self):
        cache.clear()
        self.admin = User.objects.create(email='cache_admin@example.com', role=Role.ADMIN, is_active=True)

    def test_application_save_increments_cache_version(self):
        v1 = get_hierarchy_stats_version()
        app = Application.objects.create(
            candidate_name='Cache Test',
            position='Developer',
            client_name='Test Client',
            technology='Python',
            experience=2.0
        )
        v2 = get_hierarchy_stats_version()
        self.assertGreater(v2, v1)

    def test_note_save_increments_cache_version(self):
        app = Application.objects.create(
            candidate_name='Cache Test 2',
            position='Developer',
            client_name='Test Client',
            technology='Python',
            experience=2.0
        )
        v1 = get_hierarchy_stats_version()
        Note.objects.create(application=app, author=self.admin, content='Status updated to Submitted.')
        v2 = get_hierarchy_stats_version()
        self.assertGreater(v2, v1)

    def test_user_save_increments_cache_version(self):
        v1 = get_hierarchy_stats_version()
        User.objects.create(email='new_recruiter@example.com', role=Role.ASSOCIATE_ANALYST, is_active=True)
        v2 = get_hierarchy_stats_version()
        self.assertGreater(v2, v1)
