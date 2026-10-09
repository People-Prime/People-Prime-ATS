from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase, RequestFactory
from rest_framework.request import Request
from applications.views import StandardResultsSetPagination, ApplicationViewSet


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


from unittest.mock import patch
from django.test import TestCase
from django.db import IntegrityError
from applications.models import Application, CareerPortalApplicant, JobBoardPosting
from applications.integrations.foundit.candidate_ingestion import FounditCandidateIngestionService
from applications.integrations.foundit.client import FounditClient, FounditContractUnverifiedException

class FounditPhase2FoundationAndRegressionTests(TestCase):
    def setUp(self):
        self.job = Application.objects.create(
            position="Senior Full Stack Engineer",
            client_name="Test Enterprise Client",
            technology="Python, React",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            publish_to_career_page=True,
            publish_to_linkedin=True,
            remarks="[Job Details]\nJob Code: PPW - 0042\nLocation: Hyderabad\nJob Status: Active"
        )

    def test_job_board_posting_creation_and_unique_constraint(self):
        """Verify JobBoardPosting creation, unique constraint (job, job_board), and folderId external storage."""
        posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="79385361",
            status="PUBLISHED"
        )
        self.assertEqual(posting.job_board, "Foundit")
        self.assertEqual(posting.external_job_id, "79385361")
        self.assertEqual(self.job.job_board_postings.count(), 1)

        # Enforce unique constraint
        with self.assertRaises(IntegrityError):
            JobBoardPosting.objects.create(
                job=self.job,
                job_board="Foundit",
                external_job_id="99999999"
            )

    @patch('applications.ai.tasks.score_applicant_resume_task.delay')
    def test_foundit_candidate_ingestion_creates_career_portal_applicant(self, mock_ai_task):
        """Verify Foundit application mapped by folder_id creates CareerPortalApplicant with source='Foundit'."""
        JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="79385361",
            status="PUBLISHED"
        )

        app_dict = {
            "folder_id": "79385361",
            "application_id": "APP-FND-1001",
            "candidate_name": "Arjun Sharma",
            "application_date": "2026-10-06",
            "application_type": "Direct",
            "resume_file_download_url": "https://example.com/resumes/arjun.pdf",
            "profile_details": {
                "candidate_id": "CAND-FND-501",
                "email": "arjun.sharma@example.com",
                "phone": "9876543210",
                "years_of_experience": 5.5,
                "current_company": "Tech Solutions",
                "city": "Hyderabad",
                "state": "Telangana",
                "key_skills": "Python, Django, React"
            }
        }

        result = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(result.get("success"))
        self.assertFalse(result.get("duplicate"))

        applicant = CareerPortalApplicant.objects.get(id=result["applicant_id"])
        self.assertEqual(applicant.source, "Foundit")
        self.assertEqual(applicant.first_name, "Arjun")
        self.assertEqual(applicant.last_name, "Sharma")
        self.assertEqual(applicant.email, "arjun.sharma@example.com")
        self.assertEqual(applicant.foundit_application_id, "APP-FND-1001")
        self.assertEqual(applicant.job_id, self.job.id)
        mock_ai_task.assert_called_once_with(applicant.id)

    @patch('applications.ai.tasks.score_applicant_resume_task.delay')
    def test_foundit_candidate_duplicate_rejection(self, mock_ai_task):
        """Verify sending duplicate application_id returns duplicate=True without recreating applicant."""
        JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="79385361",
            status="PUBLISHED"
        )

        app_dict = {
            "folder_id": "79385361",
            "application_id": "APP-FND-DUP-500",
            "candidate_name": "Duplicate Candidate",
            "profile_details": {"email": "dup@example.com"}
        }

        res1 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res1.get("success"))
        self.assertFalse(res1.get("duplicate"))

        res2 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res2.get("success"))
        self.assertTrue(res2.get("duplicate"))
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="APP-FND-DUP-500").count(), 1)

    def test_unmatched_folder_id_fails_safely(self):
        """Verify unknown folder_id returns error cleanly without creating dummy jobs or applicants."""
        app_dict = {
            "folder_id": "UNKNOWN_FOLDER_999",
            "application_id": "APP-UNMATCHED-1",
            "candidate_name": "Unmatched Candidate"
        }

        result = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertFalse(result.get("success"))
        self.assertEqual(result.get("code"), "UNMATCHED_FOLDER_ID")
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="APP-UNMATCHED-1").count(), 0)

    def test_client_phase3a_safety_guard(self):
        """Verify FounditClient safety guard blocks unauthorized endpoints (update_job, get_applications) in Phase 3B."""
        client = FounditClient()
        with self.assertRaises(FounditContractUnverifiedException):
            client.update_job("123", {})
        with self.assertRaises(FounditContractUnverifiedException):
            client.expire_job("123")
        with self.assertRaises(FounditContractUnverifiedException):
            client.get_applications(folder_id="123")
        with self.assertRaises(FounditContractUnverifiedException):
            client.register_webhook("https://example.com/webhook")


    def test_linkedin_xml_feed_endpoint_unaffected(self):
        """Verify LinkedIn XML Feed endpoint works as expected without regression."""
        from django.utils import timezone
        from applications.public_views import PublicLinkedInJobXmlFeedAPIView
        from rest_framework.test import APIRequestFactory

        self.job.published_at = timezone.now()
        self.job.save()

        factory = APIRequestFactory()
        request = factory.get('/api/public/jobs/linkedin-feed.xml')
        view = PublicLinkedInJobXmlFeedAPIView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('<publisher>People Prime Worldwide</publisher>', response.content.decode('utf-8'))


from django.core.cache import cache
from applications.integrations.foundit.auth import FounditAuthService, FounditAuthException, CACHE_KEY_SESSION_TOKEN
from applications.integrations.foundit.client import FounditClient, FounditAPIError, FounditTimeoutError, FounditValidationError
from applications.integrations.foundit.job_posting import FounditJobPostingService
from applications.integrations.foundit.mappers import FounditJobMapper
from applications.models import JobBoardPosting

class MockTransport:
    def __init__(self, response_data, status_code=200, exception=None):
        self.response_data = response_data
        self.status_code = status_code
        self.exception = exception
        self.last_url = None
        self.last_headers = None
        self.last_json = None
        self.post_count = 0

    def request_token(self, url, headers=None, json=None):
        self.last_url = url
        self.last_headers = headers
        self.last_json = json
        if self.exception:
            raise self.exception
        return self.response_data, self.status_code

    def post(self, url, json=None, headers=None):
        self.last_url = url
        self.last_headers = headers
        self.last_json = json
        self.post_count += 1
        if self.exception:
            raise self.exception
        if self.status_code not in (200, 201):
            if self.status_code == 400:
                err_msg = FounditClient.extract_error_message(self.response_data)
                raise FounditAPIError(f"Foundit API Bad Request (HTTP 400): {err_msg}", status_code=400)
            elif self.status_code in (401, 403):
                raise FounditAPIError(f"Foundit API Auth error (HTTP {self.status_code})", status_code=self.status_code)
            elif self.status_code == 429:
                raise FounditAPIError("Foundit API rate limit exceeded (HTTP 429)", status_code=429)
            elif self.status_code >= 500:
                raise FounditAPIError(f"Foundit API server error (HTTP {self.status_code})", status_code=self.status_code)
            else:
                raise FounditAPIError(f"Foundit API error (HTTP {self.status_code})", status_code=self.status_code)
        return self.response_data

    def get(self, url, params=None, headers=None):
        self.last_url = url
        self.last_headers = headers
        self.last_params = params
        self.get_count = getattr(self, "get_count", 0) + 1
        if self.exception:
            raise self.exception
        if self.status_code not in (200, 201):
            if self.status_code == 400:
                err_msg = FounditClient.extract_error_message(self.response_data)
                raise FounditAPIError(f"Foundit API Bad Request (HTTP 400): {err_msg}", status_code=400)
            elif self.status_code in (401, 403):
                raise FounditAPIError(f"Foundit API Auth error (HTTP {self.status_code})", status_code=self.status_code)
            elif self.status_code == 404:
                raise FounditAPIError("Foundit API Not Found (HTTP 404)", status_code=404)
            elif self.status_code == 429:
                raise FounditAPIError("Foundit API rate limit exceeded (HTTP 429)", status_code=429)
            elif self.status_code >= 500:
                raise FounditAPIError(f"Foundit API server error (HTTP {self.status_code})", status_code=self.status_code)
            else:
                raise FounditAPIError(f"Foundit API error (HTTP {self.status_code})", status_code=self.status_code)
        if isinstance(self.response_data, list):
            idx = min(self.get_count - 1, len(self.response_data) - 1)
            return self.response_data[idx]
        return self.response_data



from django.test import override_settings

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditPhase3AAuthTests(TestCase):
    def setUp(self):
        try:
            cache.delete(CACHE_KEY_SESSION_TOKEN)
        except Exception:
            pass

        self.valid_credentials = {
            "api_key": "test_api_key",
            "corp_id": "test_corp_id",
            "login_id": "test_login_id",
            "username": "test_username",
            "password": "test_password",
            "channel_id": "test_channel_id",
            "sub_channel_id": "test_sub_channel_id"
        }

    def tearDown(self):
        cache.delete(CACHE_KEY_SESSION_TOKEN)

    def test_1_successful_authentication(self):
        """Test 1: Verify correct URL, POST method, x-api-key header, JSON body parameters, and session token extraction."""
        mock_transport = MockTransport({"x-session-token": "MOCK_SESSION_TOKEN_123"}, status_code=200)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        token = service.get_session_token(force_refresh=True)
        self.assertEqual(token, "MOCK_SESSION_TOKEN_123")
        self.assertEqual(mock_transport.last_url, "https://recruiter.foundit.in/recruiter-ats/generate/api/token")
        self.assertEqual(mock_transport.last_headers.get("x-api-key"), "test_api_key")
        self.assertEqual(mock_transport.last_json["channelId"], "test_channel_id")
        self.assertEqual(mock_transport.last_json["corpId"], "test_corp_id")
        self.assertEqual(mock_transport.last_json["username"], "test_username")
        self.assertEqual(mock_transport.last_json["password"], "test_password")

    def test_2_missing_credentials_fails_safely(self):
        """Test 2: Verify missing configuration fails safely with FounditAuthException without making HTTP request."""
        service = FounditAuthService()
        service.credentials = {"api_key": "", "corp_id": ""}
        with self.assertRaises(FounditAuthException) as ctx:
            service.get_session_token(force_refresh=True)
        self.assertIn("missing credentials", str(ctx.exception))

    def test_3_unauthorized_401_403_handling(self):
        """Test 3: Verify HTTP 401/403 errors raise controlled FounditAuthException."""
        mock_transport = MockTransport({"error": "Unauthorized"}, status_code=401)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        with self.assertRaises(FounditAuthException) as ctx:
            service.get_session_token(force_refresh=True)
        self.assertIn("401", str(ctx.exception))

    def test_4_rate_limit_429_handling(self):
        """Test 4: Verify HTTP 429 rate limit raises controlled FounditAuthException."""
        mock_transport = MockTransport({"error": "Too Many Requests"}, status_code=429)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        with self.assertRaises(FounditAuthException) as ctx:
            service.get_session_token(force_refresh=True)
        self.assertIn("429", str(ctx.exception))

    def test_5_server_error_5xx_handling(self):
        """Test 5: Verify HTTP 500 server error raises controlled FounditAuthException."""
        mock_transport = MockTransport({"error": "Internal Server Error"}, status_code=500)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        with self.assertRaises(FounditAuthException) as ctx:
            service.get_session_token(force_refresh=True)
        self.assertIn("500", str(ctx.exception))

    def test_6_invalid_response_missing_token(self):
        """Test 6: Verify missing session token in response raises controlled FounditAuthException."""
        mock_transport = MockTransport({"status": "SUCCESS"}, status_code=200)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        with self.assertRaises(FounditAuthException) as ctx:
            service.get_session_token(force_refresh=True)
        self.assertIn("Response did not contain a valid session token", str(ctx.exception))

    def test_7_token_caching(self):
        """Test 7: Verify repeated calls reuse a valid cached session token from Django cache."""
        mock_transport = MockTransport({"x-session-token": "CACHED_TOKEN_999"}, status_code=200)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        token1 = service.get_session_token(force_refresh=True)
        self.assertEqual(token1, "CACHED_TOKEN_999")

        # Second call with new mock transport should reuse cached token
        mock_transport_2 = MockTransport({"x-session-token": "NEW_TOKEN"}, status_code=200)
        service2 = FounditAuthService(transport=mock_transport_2)
        service2.credentials = self.valid_credentials

        token2 = service2.get_session_token(force_refresh=False)
        self.assertEqual(token2, "CACHED_TOKEN_999")
        self.assertIsNone(mock_transport_2.last_url)  # No HTTP call was made!

    def test_8_token_refresh(self):
        """Test 8: Verify force_refresh=True replaces cached token with newly generated token."""
        cache.set(CACHE_KEY_SESSION_TOKEN, "OLD_EXPIRED_TOKEN")

        mock_transport = MockTransport({"x-session-token": "FRESH_TOKEN_777"}, status_code=200)
        service = FounditAuthService(transport=mock_transport)
        service.credentials = self.valid_credentials

        token = service.get_session_token(force_refresh=True)
        self.assertEqual(token, "FRESH_TOKEN_777")
        self.assertEqual(cache.get(CACHE_KEY_SESSION_TOKEN), "FRESH_TOKEN_777")


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditPhase3BJobPostingTests(TestCase):
    def setUp(self):
        self.job = Application.objects.create(
            candidate_name="",
            position="Senior Python Engineer",
            technology="Python, Django, Celery",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Acme Tech Solutions",
            remarks="High-priority role."
        )
        self.creds_patcher = patch("applications.integrations.foundit.mappers.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "username": "test_username",
            "password": "test_password",
            "corp_id": "test_corp",
            "api_key": "test_key",
            "channel_id": "1",
            "sub_channel_id": "1",
        }
        self.addCleanup(self.creds_patcher.stop)

    def test_1_new_job_payload_mapping(self):
        """Test 1: Verify folderId=0, mapToExistingFolderId=0, status='save', userName, password and mapped fields in payload."""
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertEqual(payload["userName"], "test_username")
        self.assertEqual(payload["password"], "test_password")
        self.assertEqual(payload["folderId"], 0)
        self.assertEqual(payload["mapToExistingFolderId"], 0)
        self.assertEqual(payload["status"], "save")
        self.assertEqual(payload["jobTitle"], "Senior Python Engineer")
        self.assertIn("Python", payload["skills"])
        self.assertEqual(payload["minExperience"], 5.0)
        self.assertEqual(payload["locations"][0]["city"], "Hyderabad")
        self.assertEqual(payload["locations"][0]["state"], "Telangana")

    def test_1b_missing_username_raises_validation_error(self):
        """Test 1b: Verify missing Foundit username configuration raises FounditValidationError safely."""
        self.mock_creds.return_value = {"username": "", "password": "test_password"}
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("Missing required Foundit username", str(ctx.exception))

    def test_1c_missing_password_raises_validation_error(self):
        """Test 1c: Verify missing Foundit password configuration raises FounditValidationError safely."""
        self.mock_creds.return_value = {"username": "test_username", "password": ""}
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("Missing required Foundit password", str(ctx.exception))
    def test_2_successful_job_posting_response(self):
        """Test 2: Mock folderId=12345678 response and verify JobBoardPosting is saved with status=PUBLISHED."""
        mock_transport = MockTransport({"folderId": 12345678, "status": "save"}, status_code=200)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "PUBLISHED")
        self.assertEqual(posting.external_job_id, "12345678")
        self.assertIsNotNone(posting.published_at)
        self.assertIsNotNone(posting.last_synced_at)
        self.assertEqual(posting.error_message, "")

    def test_3_missing_folder_id_returns_failure(self):
        """Test 3: Verify missing or 0 folderId in response does not mark JobBoardPosting as PUBLISHED."""
        mock_transport = MockTransport({"status": "save"}, status_code=200)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertNotEqual(posting.status, "PUBLISHED")
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("folderId", posting.error_message)

    def test_4_already_published_idempotency(self):
        """Test 4: Verify an already published job does not trigger a second Foundit API request."""
        posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="99999",
            status="PUBLISHED"
        )
        mock_transport = MockTransport({"folderId": 99999}, status_code=200)
        client = FounditClient(transport=mock_transport)

        result_posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(result_posting.id, posting.id)
        self.assertEqual(mock_transport.post_count, 0)  # No second API call!

    def test_5a_http_400_message_structure(self):
        """Test 5a: Structure A - {"message": "Invalid request parameters."}"""
        mock_transport = MockTransport({"message": "Invalid request parameters."}, status_code=400)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("Invalid request parameters.", posting.error_message)

    def test_5b_http_400_error_structure(self):
        """Test 5b: Structure B - {"error": "Invalid request parameters."}"""
        mock_transport = MockTransport({"error": "Invalid request parameters."}, status_code=400)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("Invalid request parameters.", posting.error_message)

    def test_5c_http_400_nested_errors_array(self):
        """Test 5c: Structure C - {"errors": [{"field": "minExperience", "message": "Must be an integer"}]}"""
        mock_transport = MockTransport(
            {"errors": [{"field": "minExperience", "message": "Must be an integer"}]},
            status_code=400
        )
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("Field 'minExperience': Must be an integer", posting.error_message)

    def test_5d_http_400_nested_details_array(self):
        """Test 5d: Structure D - {"details": [{"field": "locations", "message": "Invalid location format"}]}"""
        mock_transport = MockTransport(
            {"details": [{"field": "locations", "message": "Invalid location format"}]},
            status_code=400
        )
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("Field 'locations': Invalid location format", posting.error_message)

    def test_5e_http_400_non_json_response(self):
        """Test 5e: Structure E - Non-JSON 400 response string"""
        mock_transport = MockTransport("<html>400 Bad Request</html>", status_code=400)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("400 Bad Request", posting.error_message)

    def test_6_http_401_403_auth_failure_handling(self):
        """Test 6: Verify HTTP 401/403 auth error marks posting as FAILED without leaking secret credentials."""
        mock_transport = MockTransport({"error": "Unauthorized"}, status_code=401)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertNotIn("test_password", posting.error_message)
        self.assertNotIn("test_api_key", posting.error_message)

    def test_7_http_429_rate_limit_handling(self):
        """Test 7: Verify HTTP 429 rate limit error handles controlled failure."""
        mock_transport = MockTransport({"error": "Rate limit exceeded"}, status_code=429)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("429", posting.error_message)

    def test_8_http_5xx_server_error_handling(self):
        """Test 8: Verify HTTP 5xx server error marks posting as FAILED safely."""
        mock_transport = MockTransport({"error": "Internal server error"}, status_code=500)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "FAILED")
        self.assertIn("500", posting.error_message)

    def test_9_timeout_handling_requires_reconciliation(self):
        """Test 9: Verify timeout marks posting as PENDING requiring reconciliation without blind retries."""
        mock_transport = MockTransport({}, exception=FounditTimeoutError("Timed out after 15 seconds"))
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "PENDING")
        self.assertIn("Reconciliation required", posting.error_message)

    def test_10_linkedin_feed_regression(self):
        """Test 10: Verify LinkedIn XML feed endpoint remains unaffected and returns HTTP 200."""
        from django.utils import timezone
        from applications.public_views import PublicLinkedInJobXmlFeedAPIView
        from rest_framework.test import APIRequestFactory

        self.job.published_at = timezone.now()
        self.job.save()

        factory = APIRequestFactory()
        request = factory.get('/api/public/jobs/linkedin-feed.xml')
        view = PublicLinkedInJobXmlFeedAPIView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('<publisher>People Prime Worldwide</publisher>', response.content.decode('utf-8'))


from applications.integrations.foundit.candidate_ingestion import (
    FounditCandidateIngestionService,
    FounditApplicationSyncService,
)
from applications.integrations.foundit.client import FounditContractUnverifiedException


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditPhase4ApplicationsTests(TestCase):
    def setUp(self):
        self.job = Application.objects.create(
            candidate_name="",
            position="Lead Data Architect",
            technology="Python, SQL, Snowflake",
            experience=8.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Acme Global",
            remarks="High priority requirement."
        )
        self.posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="12345",
            status="PUBLISHED"
        )
        # Mock credentials
        self.creds_patcher = patch("applications.integrations.foundit.constants.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "api_key": "test_api_key_4",
            "corp_id": "test_corp_4",
            "login_id": "test_login_4",
            "username": "test_user_4",
            "password": "test_password_4",
            "channel_id": "1",
            "sub_channel_id": "1",
            "webhook_secret": "test_secret_4"
        }
        self.addCleanup(self.creds_patcher.stop)

        # Mock AI scoring task
        self.score_patcher = patch("applications.ai.tasks.score_applicant_resume_task.delay")
        self.mock_score_task = self.score_patcher.start()
        self.addCleanup(self.score_patcher.stop)

    # A. Applications request construction
    def test_a1_request_construction_endpoint_headers_params(self):
        """Test A1: Verify correct endpoint, params (folder_id, corp_id, login_id, channel_id, sub_channel_id), and headers."""
        mock_transport = MockTransport({
            "folder_id": "12345",
            "total_job_applications": 0,
            "applications": []
        })
        client = FounditClient(transport=mock_transport)
        client.credentials = self.mock_creds.return_value

        res = client.get_applications("12345", page_number=2, limit=50, applications_since="2026-10-01")
        self.assertEqual(mock_transport.last_url, "https://recruiter.foundit.in/recruiter-ats/v1/job/applications")
        self.assertEqual(mock_transport.last_params["folder_id"], "12345")
        self.assertEqual(mock_transport.last_params["corp_id"], "test_corp_4")
        self.assertEqual(mock_transport.last_params["login_id"], "test_login_4")
        self.assertEqual(mock_transport.last_params["channel_id"], "1")
        self.assertEqual(mock_transport.last_params["sub_channel_id"], "1")
        self.assertEqual(mock_transport.last_params["limit"], 50)
        self.assertEqual(mock_transport.last_params["page_number"], 2)
        self.assertEqual(mock_transport.last_params["applications_since"], "2026-10-01")

    def test_a2_limit_capped_at_100(self):
        """Test A2: Verify limit parameter never exceeds 100."""
        mock_transport = MockTransport({"applications": []})
        client = FounditClient(transport=mock_transport)
        client.get_applications("12345", limit=500)
        self.assertEqual(mock_transport.last_params["limit"], 100)

    def test_a3_live_call_guard_blocks_unauthorized(self):
        """Test A3: Verify live outbound call without mock transport is blocked by safety guard."""
        client = FounditClient()
        with self.assertRaises(FounditContractUnverifiedException) as ctx:
            client.get_applications("12345")
        self.assertIn("live execution is blocked", str(ctx.exception))

    # B. Pagination
    def test_b1_pagination_single_page(self):
        """Test B1: One-page response fetches all applications and terminates."""
        mock_data = {
            "folder_id": "12345",
            "total_job_applications": 2,
            "applications": [
                {"application_id": "APP_01", "candidate_name": "Alice Green", "folder_id": "12345"},
                {"application_id": "APP_02", "candidate_name": "Bob Brown", "folder_id": "12345"}
            ]
        }
        client = FounditClient(transport=MockTransport(mock_data))
        summary = FounditApplicationSyncService.sync_applications_for_folder("12345", client=client)

        self.assertEqual(summary["pages_fetched"], 1)
        self.assertEqual(summary["new_ingested"], 2)
        self.assertEqual(summary["duplicates_skipped"], 0)

    def test_b2_pagination_multiple_pages(self):
        """Test B2: Multiple pages are iterated sequentially until total_job_applications is satisfied."""
        page_1 = {
            "folder_id": "12345",
            "total_job_applications": 2,
            "applications": [{"application_id": "APP_01", "candidate_name": "Alice", "folder_id": "12345"}]
        }
        page_2 = {
            "folder_id": "12345",
            "total_job_applications": 2,
            "applications": [{"application_id": "APP_02", "candidate_name": "Bob", "folder_id": "12345"}]
        }
        client = FounditClient(transport=MockTransport([page_1, page_2]))
        summary = FounditApplicationSyncService.sync_applications_for_folder("12345", client=client, limit=1)

        self.assertEqual(summary["pages_fetched"], 2)
        self.assertEqual(summary["new_ingested"], 2)

    def test_b3_pagination_zero_applications(self):
        """Test B3: Zero applications stops on page 1 without unnecessary subsequent requests."""
        empty_data = {
            "folder_id": "12345",
            "total_job_applications": 0,
            "applications": []
        }
        client = FounditClient(transport=MockTransport(empty_data))
        summary = FounditApplicationSyncService.sync_applications_for_folder("12345", client=client)

        self.assertEqual(summary["pages_fetched"], 1)
        self.assertEqual(summary["total_fetched"], 0)
        self.assertEqual(summary["new_ingested"], 0)

    def test_b4_pagination_max_pages_safety_limit(self):
        """Test B4: Defensive maximum page limit stops loop if API malforms or repeats."""
        endless_page = {
            "folder_id": "12345",
            "total_job_applications": 9999,
            "applications": [{"application_id": "APP_X", "candidate_name": "Loop Candidate", "folder_id": "12345"}]
        }
        client = FounditClient(transport=MockTransport(endless_page))
        summary = FounditApplicationSyncService.sync_applications_for_folder(
            "12345",
            client=client,
            max_pages=3
        )
        self.assertEqual(summary["pages_fetched"], 3)

    # C. Job mapping
    def test_c1_valid_folder_id_maps_to_ats_job(self):
        """Test C1: Valid folder_id resolves JobBoardPosting and attaches applicant to ATS job."""
        app_dict = {
            "application_id": "APP_M1",
            "candidate_name": "Charlie Chaplin",
            "folder_id": "12345"
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.job, self.job)

    def test_c2_unmatched_folder_id_returns_safe_error(self):
        """Test C2: Unmatched folder_id does not create applicant and returns UNMATCHED_FOLDER_ID."""
        app_dict = {
            "application_id": "APP_M2",
            "candidate_name": "Unknown Applicant",
            "folder_id": "UNKNOWN_9999"
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertFalse(res["success"])
        self.assertEqual(res["code"], "UNMATCHED_FOLDER_ID")
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="APP_M2").exists())

    # D. Deduplication
    def test_d1_deduplication_prevents_duplicate_applicant(self):
        """Test D1: Duplicate foundit_application_id is skipped cleanly and idempotently."""
        app_dict = {
            "application_id": "APP_DUP_1",
            "candidate_name": "Diana Prince",
            "folder_id": "12345"
        }
        res1 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res1["success"])
        self.assertFalse(res1.get("duplicate", False))

        res2 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res2["success"])
        self.assertTrue(res2.get("duplicate"))
        self.assertEqual(res2["applicant_id"], res1["applicant_id"])
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="APP_DUP_1").count(), 1)

    # E. Candidate creation
    def test_e1_candidate_creation_fields(self):
        """Test E1: Validates CareerPortalApplicant creation fields: source='Foundit', status='New', is_imported=False."""
        app_dict = {
            "application_id": "APP_FIELDS_1",
            "candidate_name": "Edward Norton",
            "folder_id": "12345",
            "profile_details": {
                "email": "edward@example.com",
                "phone": "+919876543210",
                "candidate_id": "CAND_999"
            }
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.source, "Foundit")
        self.assertEqual(applicant.status, "New")
        self.assertFalse(applicant.is_imported)
        self.assertEqual(applicant.first_name, "Edward")
        self.assertEqual(applicant.last_name, "Norton")
        self.assertEqual(applicant.email, "edward@example.com")
        self.assertEqual(applicant.mobile_number, "+919876543210")
        self.assertEqual(applicant.foundit_application_id, "APP_FIELDS_1")
        self.assertEqual(applicant.foundit_candidate_id, "CAND_999")

    # F. Resume handling
    @patch("requests.get")
    @patch("boto3.client")
    def test_f1_resume_s3_upload_success(self, mock_boto, mock_get):
        """Test F1: Resume binary is streamed to S3 and s3:// link saved."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raw = MagicMock()
        mock_get.return_value.__enter__.return_value = mock_response

        with patch.dict("os.environ", {
            "AWS_ACCESS_KEY_ID": "mock_key",
            "AWS_SECRET_ACCESS_KEY": "mock_secret",
            "AWS_STORAGE_BUCKET_NAME": "ats-resumestorage"
        }):
            app_dict = {
                "application_id": "APP_RESUME_1",
                "candidate_name": "Fiona Gallagher",
                "folder_id": "12345",
                "resume_file_download_url": "https://foundit.in/download/resume_123.pdf"
            }
            res = FounditCandidateIngestionService.ingest_candidate(app_dict)
            applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
            self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_RESUME_1.pdf")

    @patch("requests.get")
    def test_f2_resume_s3_upload_failure_fallback_to_url(self, mock_get):
        """Test F2: Resume download failure falls back safely to original download URL."""
        mock_get.side_effect = Exception("Download failed")
        app_dict = {
            "application_id": "APP_RESUME_2",
            "candidate_name": "George Clark",
            "folder_id": "12345",
            "resume_file_download_url": "https://foundit.in/download/resume_fallback.pdf"
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/resume_fallback.pdf")

    # G. AI scoring
    def test_g1_ai_scoring_task_dispatched(self):
        """Test G1: score_applicant_resume_task is dispatched after successful applicant creation."""
        app_dict = {
            "application_id": "APP_AI_1",
            "candidate_name": "Hannah Abbott",
            "folder_id": "12345"
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.mock_score_task.assert_called_once_with(res["applicant_id"])

    # H. Defensive profile parsing
    def test_h1_defensive_profile_parsing_missing_profile(self):
        """Test H1: Missing profile_details (None) is handled defensively without error."""
        app_dict = {
            "application_id": "APP_DEF_1",
            "candidate_name": "Ian Malcolm",
            "folder_id": "12345",
            "profile_details": None
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.email, "")
        self.assertEqual(applicant.qualification, "Not Specified")

    def test_h2_defensive_profile_parsing_unexpected_structure(self):
        """Test H2: Unexpected non-dict profile_details string or list is handled defensively."""
        app_dict = {
            "application_id": "APP_DEF_2",
            "candidate_name": "Julia Roberts",
            "folder_id": "12345",
            "profile_details": "invalid_string_profile"
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.email, "")

    # I. Error handling
    def test_i1_client_error_handling(self):
        """Test I1: Verify 400, 401, 404, 429, 500, and timeout errors in get_applications."""
        for code in [400, 401, 404, 429, 500]:
            mock_transport = MockTransport({"message": f"Error {code}"}, status_code=code)
            client = FounditClient(transport=mock_transport)
            with self.assertRaises(FounditAPIError):
                client.get_applications("12345")

        timeout_transport = MockTransport({}, exception=FounditTimeoutError("Timed out after 15 seconds"))
        client = FounditClient(transport=timeout_transport)
        with self.assertRaises(FounditTimeoutError):
            client.get_applications("12345")

    # J. Secret safety
    def test_j1_secrets_never_in_logs_or_errors(self):
        """Test J1: Verify password and session token are never leaked in error messages."""
        mock_transport = MockTransport({"error": "Auth failed"}, status_code=401)
        client = FounditClient(transport=mock_transport)
        try:
            client.get_applications("12345")
        except FounditAPIError as e:
            self.assertNotIn("test_password_4", str(e))
            self.assertNotIn("test_api_key_4", str(e))





