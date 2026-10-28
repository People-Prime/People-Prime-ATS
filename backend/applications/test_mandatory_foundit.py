import re
from unittest.mock import patch
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User, Role
from applications.models import Application, JobBoardPosting
from applications.serializers import ApplicationCreateSerializer, ApplicationSerializer


class MandatoryFounditRequirementCreationTests(TestCase):
    """
    Focused regression test suite verifying:
    1. New job creation with Foundit selected succeeds.
    2. New job creation with Foundit unchecked is rejected with HTTP 400.
    3. New job creation with Foundit field missing is rejected with HTTP 400.
    4. Candidate application creation without Foundit selection succeeds.
    5. Editing an existing job with Foundit unchecked succeeds.
    6. Correct creation of the Foundit JobBoardPosting record (UNPUBLISHED).
    7. No duplicate Foundit posting records or automatic publishing requests.
    """

    def setUp(self):
        self.admin_user = User.objects.create(
            email='admin_mandatory_test@example.com',
            full_name='Admin Test User',
            role=Role.ADMIN,
            is_active=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

        self.valid_job_payload = {
            "client_name": "Acme Tech Services",
            "position": "Senior Backend Engineer",
            "technology": "Python, Django",
            "experience": 4.0,
            "max_experience": "8",
            "city": "Hyderabad",
            "state": "Telangana",
            "country": "India",
            "remarks": "[Job Details]\nJob Code: PPW-5001\nCTC: 15-22 LPA\nExperience: 4 - 8 years\n",
            "publish_to_career_page": True,
            "publish_to_linkedin": False,
            "publish_to_foundit": True
        }

    def test_new_job_creation_with_foundit_selected(self):
        """New job creation with publish_to_foundit=True succeeds and returns HTTP 201."""
        response = self.client.post("/api/applications/", self.valid_job_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json().get("publish_to_foundit"), True)

        job_id = response.json()["id"]
        job = Application.objects.get(id=job_id)
        self.assertEqual(job.position, "Senior Backend Engineer")
        self.assertEqual(job.client_name, "Acme Tech Services")

    def test_new_job_creation_with_foundit_unchecked(self):
        """New job creation with publish_to_foundit=False is rejected with HTTP 400 and clear message."""
        payload = {**self.valid_job_payload, "publish_to_foundit": False}
        response = self.client.post("/api/applications/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertIn("publish_to_foundit", data)
        self.assertIn(
            "Please select Publish to Foundit before creating the job requirement.",
            str(data["publish_to_foundit"])
        )
        # Ensure no application was saved
        self.assertFalse(Application.objects.filter(position="Senior Backend Engineer").exists())

    def test_new_job_creation_with_foundit_field_missing(self):
        """New job creation with publish_to_foundit omitted is rejected with HTTP 400 and clear message."""
        payload = dict(self.valid_job_payload)
        del payload["publish_to_foundit"]

        response = self.client.post("/api/applications/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertIn("publish_to_foundit", data)
        self.assertIn(
            "Please select Publish to Foundit before creating the job requirement.",
            str(data["publish_to_foundit"])
        )
        self.assertFalse(Application.objects.filter(position="Senior Backend Engineer").exists())

    def test_candidate_application_creation_without_foundit_selection(self):
        """Candidate application creation (candidate_name present) does NOT require Foundit selection."""
        candidate_payload = {
            "candidate_name": "Jane Candidate",
            "candidate_email": "jane.candidate@example.com",
            "candidate_phone": "9876543210",
            "client_name": "Acme Tech Services",
            "position": "Senior Backend Engineer",
            "technology": "Python, Django",
            "experience": 4.0,
            "country": "India",
            "city": "Hyderabad",
            "state": "Telangana",
            "remarks": "Applied via referral"
        }
        response = self.client.post("/api/applications/", candidate_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        candidate_id = response.json()["id"]
        candidate = Application.objects.get(id=candidate_id)
        self.assertEqual(candidate.candidate_name, "Jane Candidate")
        self.assertEqual(candidate.candidate_email, "jane.candidate@example.com")
        # Candidate should not have a Foundit JobBoardPosting
        self.assertFalse(JobBoardPosting.objects.filter(job=candidate, job_board="Foundit").exists())

    def test_editing_existing_job_with_foundit_unchecked(self):
        """Editing an existing job does not require publish_to_foundit=True."""
        # Create an existing job without a Foundit posting directly in DB (simulating legacy job)
        existing_job = Application.objects.create(
            candidate_name="",
            client_name="Legacy Client",
            position="Fullstack Developer",
            technology="React, Node.js",
            experience=3.0,
            country="India",
            city="Bengaluru",
            state="Karnataka",
            remarks="[Job Details]\nJob Code: PPW-1001\nStart Date: 2026-01-01\nEnd Date: 2026-12-31\n",
            publish_to_career_page=True,
            publish_to_linkedin=False
        )

        edit_payload = {
            "client_name": "Legacy Client Updated",
            "position": "Lead Fullstack Developer",
            "technology": "React, Node.js, TypeScript",
            "experience": 4.0,
            "country": "India",
            "city": "Bengaluru",
            "state": "Karnataka",
            "remarks": "[Job Details]\nJob Code: PPW-1001\nStart Date: 2026-01-01\nEnd Date: 2026-12-31\n",
            "publish_to_career_page": True,
            "publish_to_linkedin": False,
            "publish_to_foundit": False
        }

        response = self.client.put(f"/api/applications/{existing_job.id}/", edit_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        existing_job.refresh_from_db()
        self.assertEqual(existing_job.client_name, "Legacy Client Updated")
        self.assertEqual(existing_job.position, "Lead Fullstack Developer")
        # Foundit posting should still not exist
        self.assertFalse(JobBoardPosting.objects.filter(job=existing_job, job_board="Foundit").exists())

    def test_correct_creation_of_foundit_job_board_posting_record(self):
        """Creating a new job requirement correctly creates a JobBoardPosting with status UNPUBLISHED."""
        response = self.client.post("/api/applications/", self.valid_job_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        job_id = response.json()["id"]
        posting = JobBoardPosting.objects.filter(job_id=job_id, job_board="Foundit").first()
        self.assertIsNotNone(posting)
        self.assertEqual(posting.status, "UNPUBLISHED")
        self.assertEqual(posting.external_job_id, "")

    def test_no_duplicate_foundit_posting_records_or_publishing_requests(self):
        """Creating and subsequently updating a job requirement never triggers auto-publish or creates duplicate postings."""
        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            # 1. Create job
            response = self.client.post("/api/applications/", self.valid_job_payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            job_id = response.json()["id"]

            # Must not call external Foundit publish API
            mock_post_job.assert_not_called()

            # Must have exactly 1 JobBoardPosting
            postings_count = JobBoardPosting.objects.filter(job_id=job_id, job_board="Foundit").count()
            self.assertEqual(postings_count, 1)

            # 2. Update job while keeping publish_to_foundit=True
            update_payload = {
                **self.valid_job_payload,
                "position": "Senior Backend Engineer (Updated)"
            }
            update_response = self.client.put(f"/api/applications/{job_id}/", update_payload, format="json")
            self.assertEqual(update_response.status_code, status.HTTP_200_OK)

            # Must still not call external Foundit publish API
            mock_post_job.assert_not_called()

            # Must still have exactly 1 JobBoardPosting (no duplicates)
            postings_count_after = JobBoardPosting.objects.filter(job_id=job_id, job_board="Foundit").count()
            self.assertEqual(postings_count_after, 1)

    def test_direct_serializer_validation(self):
        """Direct tests of ApplicationCreateSerializer vs ApplicationSerializer."""
        # ApplicationCreateSerializer rejects job creation with missing publish_to_foundit
        raw_data = {
            "client_name": "Direct Client",
            "position": "Dev",
            "technology": "Python",
            "experience": 2.0,
            "country": "India",
            "city": "Pune",
            "publish_to_career_page": True
        }
        s_create_missing = ApplicationCreateSerializer(data=raw_data)
        self.assertFalse(s_create_missing.is_valid())
        self.assertIn("publish_to_foundit", s_create_missing.errors)

        # ApplicationCreateSerializer rejects job creation with publish_to_foundit=False
        s_create_false = ApplicationCreateSerializer(data={**raw_data, "publish_to_foundit": False})
        self.assertFalse(s_create_false.is_valid())
        self.assertIn("publish_to_foundit", s_create_false.errors)

        # ApplicationCreateSerializer accepts candidate creation without publish_to_foundit
        candidate_data = {**raw_data, "candidate_name": "Direct Candidate"}
        s_create_candidate = ApplicationCreateSerializer(data=candidate_data)
        self.assertTrue(s_create_candidate.is_valid(), s_create_candidate.errors)

        # ApplicationSerializer (used on update/edit) allows publish_to_foundit=False without error
        s_update = ApplicationSerializer(data={**raw_data, "publish_to_foundit": False})
        self.assertTrue(s_update.is_valid(), s_update.errors)
