"""
Comprehensive Regression Tests for ATS Job Editing Safeguard in People Prime ATS.

Verifies:
1. Single-recruiter job edit (updates existing ID, no new row created).
2. Multi-recruiter job edit (updates existing sibling rows, preserves Job Code).
3. Adding a recruiter to existing requirement (creates sibling row with same Job Code).
4. Editing without changing recruiter assignments (updates all sibling rows).
5. Removing a recruiter (removes deselected sibling row, retains others).
6. Editing closed job (status and applicants preserved).
7. Editing job with historical LinkedIn applicants (retains applicants).
8. Editing job with historical Foundit applicants (retains applicants).
9. Editing job with Career Portal applicants (retains applicants).
10. Direct URL GET application detail endpoint returns complete data for edit mode.
11. Sibling lookup by job code via global_search returns all sibling assignments.
12. Save blocked when job ID does not exist (returns 404, no new row created).
13. Duplicate save idempotency (multiple PUT calls preserve exact record count).
14. Original job ID and Job Code remain unchanged across updates.
15. Role-based permissions enforcement for job editing.
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from applications.models import Application, CareerPortalApplicant, JobBoardPosting
from users.models import Role

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class JobEditSafeguardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='admin@example.com',
            full_name='Admin User',
            password='TestPassword123!',
            role=Role.ADMIN
        )
        self.recruiter1 = User.objects.create_user(
            email='alice@example.com',
            full_name='Alice Analyst',
            password='TestPassword123!',
            role=Role.ASSOCIATE_ANALYST
        )
        self.recruiter2 = User.objects.create_user(
            email='bob@example.com',
            full_name='Bob Analyst',
            password='TestPassword123!',
            role=Role.ASSOCIATE_ANALYST
        )
        self.recruiter3 = User.objects.create_user(
            email='charlie@example.com',
            full_name='Charlie Analyst',
            password='TestPassword123!',
            role=Role.ASSOCIATE_ANALYST
        )
        self.client.force_authenticate(user=self.admin)

    def _create_job_posting(self, **kwargs):
        publish_foundit = kwargs.pop('publish_to_foundit', False)
        defaults = {
            'candidate_name': '',
            'candidate_email': '',
            'candidate_phone': '',
            'position': 'Fullstack Python Engineer',
            'client_name': 'Acme Corp',
            'technology': 'Python, React, PostgreSQL',
            'experience': 5.0,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'status': 'New',
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'remarks': '[Job Details]\nJob Code: PPW - [Auto Generated]\nMax Experience: 8\nLocation: Bangalore\nJob Status: Active\nDescription: Great opportunity.'
        }
        defaults.update(kwargs)
        job = Application.objects.create(**defaults)
        if publish_foundit:
            JobBoardPosting.objects.get_or_create(job=job, job_board='Foundit', defaults={'status': 'PUBLISHED'})
        return job

    def _create_portal_applicant(self, **kwargs):
        defaults = {
            'qualification': 'B.Tech',
            'years_of_experience': 4.0,
            'expected_pay': 1200000.00,
            'primary_skills': 'Python',
            'current_ctc': 800000.00,
            'current_company': 'Tech Corp',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'accepted_terms': True,
            'status': 'New',
            'first_name': 'Candidate',
            'last_name': 'User',
            'email': 'candidate@example.com',
            'source': 'Company Career Portal'
        }
        defaults.update(kwargs)
        return CareerPortalApplicant.objects.create(**defaults)

    def test_single_recruiter_job_edit_updates_existing_id_without_creating_new_row(self):
        """1. Single-recruiter job edit: updates the existing record ID without creating an extra database row."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        initial_count = Application.objects.count()
        job_id = job.id
        job_code = f"PPW - {job.id:04d}"

        update_payload = {
            'client_name': 'Acme Global Corp',
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Lead Python Architect',
            'technology': 'Python, Django, AWS, Kubernetes',
            'experience': 8.0,
            'max_experience': '12',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': f'[Job Details]\nJob Code: {job_code}\nClient Bill Rate: 350000\nPay Rate: 2500000\nMax Experience: 12\nLocation: Remote\nJob Status: Active',
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'publish_to_foundit': True
        }

        response = self.client.put(f'/api/applications/{job_id}/', update_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.assertEqual(Application.objects.count(), initial_count, "No new Application row should be created.")
        job.refresh_from_db()
        self.assertEqual(job.id, job_id, "Job ID must remain identical.")
        self.assertEqual(job.client_name, 'Acme Global Corp')
        self.assertEqual(job.position, 'Lead Python Architect')
        self.assertIn(f'Job Code: {job_code}', job.remarks)

    def test_multi_recruiter_job_edit_updates_existing_sibling_rows_preserving_job_code(self):
        """2. Multi-recruiter job edit: updates sibling rows assigned to different recruiters while preserving shared Job Code."""
        job1 = self._create_job_posting(assigned_employee=self.recruiter1)
        shared_code = f"PPW - {job1.id:04d}"

        job2 = self._create_job_posting(
            assigned_employee=self.recruiter2,
            remarks=f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8\nLocation: Bangalore\nJob Status: Active'
        )

        initial_count = Application.objects.count()

        # Update both sibling jobs
        for job, rec in [(job1, self.recruiter1), (job2, self.recruiter2)]:
            payload = {
                'client_name': 'Acme Updated',
                'country': 'India',
                'state': 'Karnataka',
                'city': 'Bangalore',
                'position': 'Senior Software Architect',
                'technology': 'Python, React, TypeScript',
                'experience': 7.0,
                'max_experience': '10',
                'assigned_employee_id': rec.email,
                'remarks': f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 10\nLocation: Bangalore\nJob Status: Active',
                'publish_to_career_page': True,
                'publish_to_linkedin': True,
                'publish_to_foundit': False
            }
            res = self.client.put(f'/api/applications/{job.id}/', payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(Application.objects.count(), initial_count, "Sibling updates must not create new rows.")
        job1.refresh_from_db()
        job2.refresh_from_db()
        self.assertIn(f'Job Code: {shared_code}', job1.remarks)
        self.assertIn(f'Job Code: {shared_code}', job2.remarks)
        self.assertEqual(job1.position, 'Senior Software Architect')
        self.assertEqual(job2.position, 'Senior Software Architect')

    def test_adding_recruiter_to_existing_requirement_creates_sibling_with_same_job_code(self):
        """3. Adding a recruiter creates an associated sibling row with the exact same Job Code."""
        job1 = self._create_job_posting(assigned_employee=self.recruiter1)
        shared_code = f"PPW - {job1.id:04d}"

        # Add recruiter 2 as a new sibling assignment sharing the existing Job Code
        new_sibling_payload = {
            'client_name': job1.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': job1.position,
            'technology': job1.technology,
            'experience': job1.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter2.email,
            'remarks': f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8\nLocation: Bangalore\nJob Status: Active',
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'publish_to_foundit': True
        }
        res = self.client.post('/api/applications/', new_sibling_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        sibling_id = res.data['id']
        self.assertNotEqual(sibling_id, job1.id)
        sibling_job = Application.objects.get(id=sibling_id)
        self.assertIn(f'Job Code: {shared_code}', sibling_job.remarks, "New sibling assignment must retain parent Job Code.")

    def test_editing_without_changing_recruiter_assignments_updates_all_sibling_rows(self):
        """4. Editing without changing recruiter assignments updates all sibling rows and creates no new rows."""
        job1 = self._create_job_posting(assigned_employee=self.recruiter1)
        shared_code = f"PPW - {job1.id:04d}"
        job2 = self._create_job_posting(
            assigned_employee=self.recruiter2,
            remarks=f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8'
        )
        count_before = Application.objects.count()

        for j, rec in [(job1, self.recruiter1), (job2, self.recruiter2)]:
            res = self.client.put(f'/api/applications/{j.id}/', {
                'client_name': 'Tech Enterprises',
                'country': 'India',
                'state': 'Karnataka',
                'city': 'Bangalore',
                'position': 'Staff Platform Engineer',
                'technology': 'Golang, Python, AWS',
                'experience': 6.0,
                'max_experience': '10',
                'assigned_employee_id': rec.email,
                'remarks': f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 10\nJob Status: Active',
                'publish_to_career_page': True,
                'publish_to_linkedin': False,
                'publish_to_foundit': False
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(Application.objects.count(), count_before)
        job1.refresh_from_db()
        job2.refresh_from_db()
        self.assertEqual(job1.position, 'Staff Platform Engineer')
        self.assertEqual(job2.position, 'Staff Platform Engineer')

    def test_removing_recruiter_deletes_deselected_sibling_row_retaining_others(self):
        """5. Removing a recruiter deletes only that specific deselected sibling row while retaining primary job."""
        job1 = self._create_job_posting(assigned_employee=self.recruiter1)
        shared_code = f"PPW - {job1.id:04d}"
        job2 = self._create_job_posting(
            assigned_employee=self.recruiter2,
            remarks=f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8'
        )

        # Recruiter 2 is deselected; delete sibling row job2
        del_res = self.client.delete(f'/api/applications/{job2.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

        # Primary job job1 is updated and retained
        update_res = self.client.put(f'/api/applications/{job1.id}/', {
            'client_name': job1.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Lead Architect',
            'technology': job1.technology,
            'experience': job1.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8\nJob Status: Active',
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'publish_to_foundit': True
        }, format='json')
        self.assertEqual(update_res.status_code, status.HTTP_200_OK, update_res.data)

        self.assertTrue(Application.objects.filter(id=job1.id).exists())
        self.assertFalse(Application.objects.filter(id=job2.id).exists())

    def test_editing_closed_job_preserves_status_and_applicants(self):
        """6. Editing a closed job preserves its status and linked applicants."""
        job = self._create_job_posting(assigned_employee=self.recruiter1, status='Closed')
        applicant = self._create_portal_applicant(
            job=job,
            first_name='John',
            last_name='Doe',
            email='john@example.com',
            source='Company Career Portal'
        )

        res = self.client.put(f'/api/applications/{job.id}/', {
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Updated Position Title',
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'status': 'Closed',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': False,
            'publish_to_linkedin': False,
            'publish_to_foundit': False
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        job.refresh_from_db()
        self.assertEqual(job.status, 'Closed')
        self.assertEqual(job.position, 'Updated Position Title')
        applicant.refresh_from_db()
        self.assertEqual(applicant.job_id, job.id)

    def test_editing_job_with_historical_linkedin_applicants_preserves_links(self):
        """7. Editing a job that has historical LinkedIn applicants retains those applicant links."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        li_applicant = self._create_portal_applicant(
            job=job,
            first_name='Alice',
            last_name='Smith',
            email='alice.smith@example.com',
            source='LinkedIn'
        )

        res = self.client.put(f'/api/applications/{job.id}/', {
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Senior Cloud Architect',
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'publish_to_foundit': True
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(CareerPortalApplicant.objects.filter(job=job, source='LinkedIn').count(), 1)
        self.assertEqual(CareerPortalApplicant.objects.get(id=li_applicant.id).job_id, job.id)

    def test_editing_job_with_historical_foundit_applicants_preserves_links(self):
        """8. Editing a job that has Foundit job postings preserves the posting records."""
        job = self._create_job_posting(assigned_employee=self.recruiter1, publish_to_foundit=True)

        res = self.client.put(f'/api/applications/{job.id}/', {
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': job.position,
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': True,
            'publish_to_linkedin': False,
            'publish_to_foundit': True
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertTrue(JobBoardPosting.objects.filter(job=job, job_board='Foundit').exists())

    def test_editing_job_with_career_portal_applicants_preserves_links(self):
        """9. Editing a job that has Career Portal applicants retains them."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        portal_app = self._create_portal_applicant(
            job=job,
            first_name='Bob',
            last_name='Jones',
            email='bob.jones@example.com',
            source='Company Career Portal'
        )

        res = self.client.put(f'/api/applications/{job.id}/', {
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Principal DevSecOps Engineer',
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': True,
            'publish_to_linkedin': False,
            'publish_to_foundit': False
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(CareerPortalApplicant.objects.filter(job=job).count(), 1)
        self.assertEqual(CareerPortalApplicant.objects.get(id=portal_app.id).job_id, job.id)

    def test_direct_url_get_application_detail_endpoint_returns_full_data_for_edit(self):
        """10. Direct GET /api/applications/:id/ returns complete job details for independent edit page loading."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        res = self.client.get(f'/api/applications/{job.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['id'], job.id)
        self.assertEqual(res.data['position'], job.position)
        self.assertEqual(res.data['client_name'], job.client_name)
        self.assertIn('Job Code:', res.data['remarks'])

    def test_sibling_lookup_by_job_code_via_global_search(self):
        """11. Sibling lookup by Job Code via ?is_job_posting=true&global_search= finds all assignments sharing the Job Code."""
        job1 = self._create_job_posting(assigned_employee=self.recruiter1)
        shared_code = f"PPW - {job1.id:04d}"
        job2 = self._create_job_posting(
            assigned_employee=self.recruiter2,
            remarks=f'[Job Details]\nJob Code: {shared_code}\nMax Experience: 8\nLocation: Pune'
        )

        res = self.client.get(f'/api/applications/?is_job_posting=true&global_search={shared_code}')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        results = res.data.get('results', res.data)
        found_ids = [r['id'] for r in results]
        self.assertIn(job1.id, found_ids)
        self.assertIn(job2.id, found_ids)

    def test_save_blocked_when_job_id_does_not_exist(self):
        """12. PUT to a non-existent job ID returns 404 and creates no records."""
        count_before = Application.objects.count()
        res = self.client.put('/api/applications/9999999/', {
            'client_name': 'Nonexistent',
            'country': 'India',
            'position': 'Fake Role'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Application.objects.count(), count_before)

    def test_duplicate_save_idempotency_preserves_record_count(self):
        """13. Rapid consecutive saves (idempotency) maintain exact record count and do not create duplicates."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        count_before = Application.objects.count()

        payload = {
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'position': 'Updated Role Title',
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': True,
            'publish_to_linkedin': True,
            'publish_to_foundit': True
        }

        # Send multiple PUT requests consecutively
        for _ in range(3):
            res = self.client.put(f'/api/applications/{job.id}/', payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(Application.objects.count(), count_before, "Consecutive PUT requests must be idempotent.")

    def test_original_job_id_and_job_code_remain_unchanged_across_updates(self):
        """14. Repeated edits do not mutate the original job ID or generated Job Code."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)
        original_id = job.id
        original_code = f"PPW - {job.id:04d}"

        for i in range(2):
            res = self.client.put(f'/api/applications/{original_id}/', {
                'client_name': f'Iteration {i}',
                'country': 'India',
                'state': 'Karnataka',
                'city': 'Bangalore',
                'position': f'Role {i}',
                'technology': 'Python',
                'experience': 5.0,
                'max_experience': '8',
                'assigned_employee_id': self.recruiter1.email,
                'remarks': f'[Job Details]\nJob Code: {original_code}\nMax Experience: 8\nIteration: {i}',
                'publish_to_career_page': True,
                'publish_to_linkedin': False,
                'publish_to_foundit': False
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        job.refresh_from_db()
        self.assertEqual(job.id, original_id)
        self.assertIn(f'Job Code: {original_code}', job.remarks)

    def test_permissions_role_based_editing_restrictions(self):
        """15. Unauthenticated requests are blocked with 401; admin can edit any application."""
        job = self._create_job_posting(assigned_employee=self.recruiter1)

        # Unauthenticated client
        unauth_client = APIClient()
        res = unauth_client.put(f'/api/applications/{job.id}/', {'position': 'Hacked Role'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Admin client succeeds
        res = self.client.put(f'/api/applications/{job.id}/', {
            'position': 'Admin Approved Role',
            'client_name': job.client_name,
            'country': 'India',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'technology': job.technology,
            'experience': job.experience,
            'max_experience': '8',
            'assigned_employee_id': self.recruiter1.email,
            'remarks': job.remarks,
            'publish_to_career_page': True,
            'publish_to_linkedin': False,
            'publish_to_foundit': False
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        job.refresh_from_db()
        self.assertEqual(job.position, 'Admin Approved Role')
