"""
Comprehensive Regression Tests for LinkedIn Applicant Visibility and Retrieval in People Prime ATS.

Covers:
1. Direct LinkedIn applicant (source='LinkedIn') retrieval via ?source=linkedin.
2. Referral LinkedIn applicant (source='Company Career Portal', referral_source='LinkedIn') retrieval via ?source=linkedin.
3. Standard Career Portal applicant retrieval via ?source=career_portal and exclusion from ?source=linkedin.
4. Referral LinkedIn applicant exclusion from ?source=career_portal.
5. Foundit applicant source isolation (included in ?source=foundit, excluded from ?source=linkedin and ?source=career_portal).
6. Unfiltered backward compatibility when ?source parameter is omitted.
7. Single job filtering via ?job_id=X.
8. Multi-job filtering via ?job_ids=X,Y and ?job_id=X,Y.
9. Serializer output verification for referral_source across different applicant types.
10. Source isolation guarantee: mutual exclusivity across ?source=linkedin, ?source=career_portal, and ?source=foundit.
11. Public job apply anti-spoofing preservation: source remains 'Company Career Portal' while referral_source is tracked.
12. Pagination and count accuracy: count reflects total matching in database, results length reflects page_size.
13. Search filtering with ?search=... within filtered source.
14. Authentication and permissions enforcement: unauthenticated requests blocked with 401.
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from applications.models import Application, CareerPortalApplicant
from applications.serializers import CareerPortalApplicantSerializer

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class LinkedInApplicantVisibilityTests(TestCase):
    def _create_applicant(self, **kwargs):
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
        }
        defaults.update(kwargs)
        return CareerPortalApplicant.objects.create(**defaults)

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='recruiter@example.com',
            full_name='Recruiter User',
            password='TestPassword123!',
            role='HR'
        )
        self.client.force_authenticate(user=self.user)

        # Create two test job postings (Application with publish_to_career_page=True)
        self.job1 = Application.objects.create(
            position='Senior Python Engineer',
            client_name='Acme Corp',
            technology='Python',
            experience=5.0,
            status='New',
            publish_to_career_page=True,
            publish_to_linkedin=True,
            remarks='Job Code: PPW - 0101'
        )
        self.job2 = Application.objects.create(
            position='Frontend React Developer',
            client_name='Beta Corp',
            technology='React',
            experience=4.0,
            status='New',
            publish_to_career_page=True,
            publish_to_linkedin=True,
            remarks='Job Code: PPW - 0102'
        )

        # 1. Direct LinkedIn applicant for Job 1
        self.app_linkedin_direct_j1 = self._create_applicant(
            job=self.job1,
            first_name='John',
            last_name='DirectLinkedIn',
            email='john.linkedin@example.com',
            mobile_number='9876543210',
            source='LinkedIn',
            raw_profile_data=None,
        )

        # 2. Referral LinkedIn applicant for Job 1
        self.app_linkedin_referral_j1 = self._create_applicant(
            job=self.job1,
            first_name='Jane',
            last_name='ReferralLinkedIn',
            email='jane.referral@example.com',
            mobile_number='9876543211',
            source='Company Career Portal',
            raw_profile_data={'referral_source': 'LinkedIn'},
        )

        # 3. Direct LinkedIn applicant for Job 2
        self.app_linkedin_direct_j2 = self._create_applicant(
            job=self.job2,
            first_name='Bob',
            last_name='Job2LinkedIn',
            email='bob.job2@example.com',
            mobile_number='9876543212',
            source='LinkedIn',
            raw_profile_data=None,
        )

        # 4. Standard Career Portal applicant for Job 1 (no raw_profile_data)
        self.app_portal_standard_j1 = self._create_applicant(
            job=self.job1,
            first_name='Alice',
            last_name='StandardPortal',
            email='alice.portal@example.com',
            mobile_number='9876543213',
            source='Company Career Portal',
            raw_profile_data=None,
        )

        # 5. Career Portal applicant for Job 1 with non-LinkedIn referral
        self.app_portal_other_referral_j1 = self._create_applicant(
            job=self.job1,
            first_name='Charlie',
            last_name='IndeedPortal',
            email='charlie.indeed@example.com',
            mobile_number='9876543214',
            source='Company Career Portal',
            raw_profile_data={'referral_source': 'Indeed'},
        )

        # 6. Foundit applicant for Job 1
        self.app_foundit_j1 = self._create_applicant(
            job=self.job1,
            first_name='Frank',
            last_name='FounditUser',
            email='frank.foundit@example.com',
            mobile_number='9876543215',
            source='Foundit',
            foundit_application_id='FND-1001',
            foundit_candidate_id='CAN-1001',
            raw_profile_data={'referral_source': 'Foundit'},
        )

    def test_direct_linkedin_applicant_retrieval(self):
        """Direct LinkedIn applicant (source='LinkedIn') is retrieved via ?source=linkedin."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        result_ids = [r['id'] for r in results]
        self.assertIn(self.app_linkedin_direct_j1.id, result_ids)

    def test_referral_linkedin_applicant_retrieval(self):
        """Referral LinkedIn applicant (source='Company Career Portal', referral_source='LinkedIn') is retrieved via ?source=linkedin."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        result_ids = [r['id'] for r in results]
        self.assertIn(self.app_linkedin_referral_j1.id, result_ids)

    def test_career_portal_applicant_retrieval_and_linkedin_exclusion(self):
        """Standard Career Portal applicant is returned under ?source=career_portal and excluded from ?source=linkedin."""
        # Query career portal
        portal_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=career_portal')
        self.assertEqual(portal_resp.status_code, status.HTTP_200_OK)
        portal_ids = [r['id'] for r in portal_resp.data['results']]
        self.assertIn(self.app_portal_standard_j1.id, portal_ids)
        self.assertIn(self.app_portal_other_referral_j1.id, portal_ids)

        # Query linkedin
        linkedin_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        linkedin_ids = [r['id'] for r in linkedin_resp.data['results']]
        self.assertNotIn(self.app_portal_standard_j1.id, linkedin_ids)
        self.assertNotIn(self.app_portal_other_referral_j1.id, linkedin_ids)

    def test_referral_linkedin_applicant_excluded_from_career_portal(self):
        """Referral LinkedIn applicant is excluded from ?source=career_portal."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=career_portal')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        portal_ids = [r['id'] for r in response.data['results']]
        self.assertNotIn(self.app_linkedin_referral_j1.id, portal_ids)

    def test_foundit_applicant_source_isolation(self):
        """Foundit applicant is isolated under ?source=foundit and excluded from other sources."""
        foundit_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=foundit')
        self.assertEqual(foundit_resp.status_code, status.HTTP_200_OK)
        foundit_ids = [r['id'] for r in foundit_resp.data['results']]
        self.assertIn(self.app_foundit_j1.id, foundit_ids)

        linkedin_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        self.assertNotIn(self.app_foundit_j1.id, [r['id'] for r in linkedin_resp.data['results']])

        portal_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=career_portal')
        self.assertNotIn(self.app_foundit_j1.id, [r['id'] for r in portal_resp.data['results']])

    def test_unfiltered_backward_compatibility(self):
        """When ?source is omitted, all applicants are returned without filtering."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        all_j1_ids = [
            self.app_linkedin_direct_j1.id,
            self.app_linkedin_referral_j1.id,
            self.app_portal_standard_j1.id,
            self.app_portal_other_referral_j1.id,
            self.app_foundit_j1.id,
        ]
        result_ids = [r['id'] for r in response.data['results']]
        for app_id in all_j1_ids:
            self.assertIn(app_id, result_ids)

    def test_single_job_id_filtering(self):
        """Querying ?job_id=X returns only applicants for job X."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        result_ids = [r['id'] for r in response.data['results']]
        self.assertIn(self.app_linkedin_direct_j1.id, result_ids)
        self.assertIn(self.app_linkedin_referral_j1.id, result_ids)
        self.assertNotIn(self.app_linkedin_direct_j2.id, result_ids)

    def test_multi_job_ids_filtering(self):
        """Querying ?job_ids=X,Y returns applicants across both jobs."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_ids={self.job1.id},{self.job2.id}&source=linkedin')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result_ids = [r['id'] for r in response.data['results']]
        self.assertIn(self.app_linkedin_direct_j1.id, result_ids)
        self.assertIn(self.app_linkedin_referral_j1.id, result_ids)
        self.assertIn(self.app_linkedin_direct_j2.id, result_ids)

        # Comma-separated job_id also works
        response2 = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id},{self.job2.id}&source=linkedin')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        result2_ids = [r['id'] for r in response2.data['results']]
        self.assertEqual(set(result_ids), set(result2_ids))

    def test_serializer_referral_source_field(self):
        """CareerPortalApplicantSerializer exposes referral_source from raw_profile_data."""
        # 1. Referral LinkedIn applicant
        data_referral = CareerPortalApplicantSerializer(self.app_linkedin_referral_j1).data
        self.assertIn('referral_source', data_referral)
        self.assertEqual(data_referral['referral_source'], 'LinkedIn')

        # 2. Direct LinkedIn applicant without raw_profile_data
        data_direct = CareerPortalApplicantSerializer(self.app_linkedin_direct_j1).data
        self.assertIn('referral_source', data_direct)
        self.assertIsNone(data_direct['referral_source'])

        # 3. Standard Career Portal applicant
        data_portal = CareerPortalApplicantSerializer(self.app_portal_standard_j1).data
        self.assertIn('referral_source', data_portal)
        self.assertIsNone(data_portal['referral_source'])

        # 4. Indeed referral applicant
        data_other = CareerPortalApplicantSerializer(self.app_portal_other_referral_j1).data
        self.assertIn('referral_source', data_other)
        self.assertEqual(data_other['referral_source'], 'Indeed')

    def test_source_separation_no_overlap(self):
        """Filtered results across linkedin, career_portal, and foundit are completely disjoint."""
        resp_linkedin = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        resp_portal = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=career_portal')
        resp_foundit = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=foundit')

        ids_linkedin = set(r['id'] for r in resp_linkedin.data['results'])
        ids_portal = set(r['id'] for r in resp_portal.data['results'])
        ids_foundit = set(r['id'] for r in resp_foundit.data['results'])

        # Pairwise intersections must be empty
        self.assertEqual(ids_linkedin & ids_portal, set(), "LinkedIn and Career Portal sets must not overlap")
        self.assertEqual(ids_linkedin & ids_foundit, set(), "LinkedIn and Foundit sets must not overlap")
        self.assertEqual(ids_portal & ids_foundit, set(), "Career Portal and Foundit sets must not overlap")

        # Union must match all applicants for job 1
        all_j1_ids = {
            self.app_linkedin_direct_j1.id,
            self.app_linkedin_referral_j1.id,
            self.app_portal_standard_j1.id,
            self.app_portal_other_referral_j1.id,
            self.app_foundit_j1.id,
        }
        self.assertEqual(ids_linkedin | ids_portal | ids_foundit, all_j1_ids)

    def test_public_job_apply_anti_spoofing_preserved(self):
        """Public application anti-spoofing preserves source='Company Career Portal' while tracking referral_source."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from unittest.mock import patch

        unauthed_client = APIClient()
        resume = SimpleUploadedFile("candidate_resume.pdf", b"%PDF-1.4 sample content", content_type="application/pdf")
        payload = {
            'first_name': 'Candidate',
            'last_name': 'FromLinkedIn',
            'email': 'candidate.linkedin@example.com',
            'mobile_number': '9998887776',
            'qualification': 'B.Tech',
            'years_of_experience': '4.0',
            'expected_pay': '1200000',
            'primary_skills': 'Python, Django',
            'current_ctc': '800000',
            'current_company': 'Tech Corp',
            'state': 'Karnataka',
            'city': 'Bangalore',
            'source': 'LinkedIn',  # Candidate applied with referral source LinkedIn
            'accepted_terms': 'true',
            'resume': resume,
        }

        with patch("applications.ai.tasks.score_applicant_resume_task.delay"):
            response = unauthed_client.post(f'/api/public/jobs/{self.job1.id}/apply/', payload, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        created_applicant = CareerPortalApplicant.objects.get(email='candidate.linkedin@example.com')
        # Anti-spoofing assertion: source must be 'Company Career Portal'
        self.assertEqual(created_applicant.source, 'Company Career Portal')
        # Referral source must be stored in raw_profile_data
        self.assertEqual(created_applicant.raw_profile_data, {'referral_source': 'LinkedIn'})

        # Now verify it appears in ?source=linkedin
        li_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        li_ids = [r['id'] for r in li_resp.data['results']]
        self.assertIn(created_applicant.id, li_ids)

        # And verify it is excluded from ?source=career_portal
        portal_resp = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=career_portal')
        portal_ids = [r['id'] for r in portal_resp.data['results']]
        self.assertNotIn(created_applicant.id, portal_ids)

    def test_pagination_and_total_count(self):
        """Database pagination limits result list while count reflects total matches."""
        # Create 3 more LinkedIn applicants for Job 1 to make 5 total (2 existing + 3 new)
        for i in range(3):
            self._create_applicant(
                job=self.job1,
                first_name=f'PagingUser{i}',
                last_name='LinkedIn',
                email=f'paging{i}@example.com',
                mobile_number=f'987654322{i}',
                source='LinkedIn',
            )

        # Page 1 with page_size=2
        resp_p1 = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin&page=1&page_size=2')
        self.assertEqual(resp_p1.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_p1.data['count'], 5)
        self.assertEqual(len(resp_p1.data['results']), 2)

        # Page 2 with page_size=2
        resp_p2 = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin&page=2&page_size=2')
        self.assertEqual(resp_p2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_p2.data['count'], 5)
        self.assertEqual(len(resp_p2.data['results']), 2)

        # Page 3 with page_size=2
        resp_p3 = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin&page=3&page_size=2')
        self.assertEqual(resp_p3.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_p3.data['count'], 5)
        self.assertEqual(len(resp_p3.data['results']), 1)

    def test_search_filtering(self):
        """Search query filters candidates within the selected source."""
        response = self.client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin&search=Jane')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result_ids = [r['id'] for r in response.data['results']]
        self.assertEqual(result_ids, [self.app_linkedin_referral_j1.id])

    def test_authentication_permissions(self):
        """Unauthenticated requests are blocked with 401 Unauthorized."""
        unauthed_client = APIClient()
        response = unauthed_client.get(f'/api/applications/career-portal-applicants/?job_id={self.job1.id}&source=linkedin')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
