from unittest.mock import MagicMock, patch
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
            remarks="High-priority role. Experience: 5-8 years."
        )
        self.creds_patcher = patch("applications.integrations.foundit.mappers.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "username": "test_username",
            "password": "test_password",
            "corp_id": "188533",
            "recruiter_id": "1220898",
            "channel_id": "1",
            "sub_channel_id": "1",
            "company_name": "People Prime Worldwide",
            "owner_name": "Test Owner",
            "owner_email": "owner@people-prime.com",
            "default_location_id": "6",
            "default_location_name": "Hyderabad / Secunderabad, Telangana",
            "default_industry_id": "140",
            "default_industry_name": "Consumer Software",
            "default_role_id": "734",
            "default_role_name": "Software Engineer",
            "default_function_name": "IT",
            "default_min_salary": "500000",
            "default_max_salary": "1000000",
            "default_currency_id": "1",
            "default_salary_confidential": "1",
            "api_key": "test_key",
        }
        self.addCleanup(self.creds_patcher.stop)

    def test_1_new_job_payload_mapping(self):
        """Test 1: Verify full-time job payload conforms to 01-ATS-EDGE-JobPosting.pdf official contract."""
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(self.job)

        # 1. Authentication & System Identifiers
        self.assertEqual(payload["userName"], "test_username")
        self.assertEqual(payload["password"], "test_password")
        self.assertIsInstance(payload["corpId"], int)
        self.assertEqual(payload["corpId"], 188533)
        self.assertIsInstance(payload["recruiterId"], int)
        self.assertEqual(payload["recruiterId"], 1220898)
        self.assertIsInstance(payload["channelId"], int)
        self.assertEqual(payload["channelId"], 1)
        self.assertEqual(payload["subChannelId"], "1")
        self.assertEqual(payload["folderId"], 0)
        self.assertEqual(payload["mapToExistingFolderId"], 0)
        self.assertEqual(payload["status"], "save")
        self.assertEqual(payload["jobPostingType"], "JP")
        self.assertEqual(payload["jobType"], "fulltime")
        self.assertEqual(payload["siteContext"], "rexmonster")

        # 2. Company & Owner Metadata
        self.assertEqual(payload["companyName"], "People Prime Worldwide")
        self.assertEqual(payload["ownerName"], "Test Owner")
        self.assertEqual(payload["ownerEmail"], "owner@people-prime.com")

        # 3. Core Job Details & Application Routing
        self.assertEqual(payload["title"], "Senior Python Engineer")
        self.assertEqual(payload["description"], "High-priority role. Experience: 5-8 years.")
        self.assertEqual(payload["applyUrl"], f"https://people-prime.com/job-details?id={self.job.id}&src=Foundit")
        self.assertEqual(payload["applicationsViaMail"], "0")
        self.assertEqual(payload["autoRenew"], "0")

        # 4. Experience & Compensation
        self.assertIsInstance(payload["minExperience"], int)
        self.assertEqual(payload["minExperience"], 5)
        self.assertIsInstance(payload["maxExperience"], int)
        self.assertEqual(payload["maxExperience"], 8)
        self.assertIsInstance(payload["minSalary"], int)
        self.assertEqual(payload["minSalary"], 500000)
        self.assertIsInstance(payload["maxSalary"], int)
        self.assertEqual(payload["maxSalary"], 1000000)
        self.assertIsInstance(payload["currencyId"], int)
        self.assertEqual(payload["currencyId"], 1)
        self.assertEqual(payload["salaryConfidential"], "1")

        # 5. Master Data Lists
        self.assertEqual(payload["locationList"], [{"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"}])
        self.assertEqual(payload["industryList"], [{"industryId": 140, "industryName": "Consumer Software"}])
        self.assertEqual(payload["roleList"], [{"roleId": 734, "roleName": "Software Engineer", "functionName": "IT"}])
        self.assertEqual(
            payload["skillList"],
            [
                {"skillId": 0, "skillName": "Python"},
                {"skillId": 0, "skillName": "Django"},
                {"skillId": 0, "skillName": "Celery"},
            ]
        )

        # 6. Priority Filter Routing Object
        self.assertIn("job_priority", payload)
        job_pri = payload["job_priority"]
        self.assertEqual(job_pri["locationFilter"], "1")
        self.assertEqual(job_pri["experienceFilter"], "1")
        self.assertEqual(job_pri["industryFilter"], "1")
        self.assertEqual(job_pri["skillFilter"], "1")
        self.assertEqual(job_pri["location_list_priority"], [{"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"}])
        self.assertEqual(job_pri["industry_list_priority"], [{"industryId": 140, "industryName": "Consumer Software"}])
        self.assertEqual(len(job_pri["prioritySkills"]), 3)
        self.assertEqual(job_pri["prioritySkills"][0]["skillName"], "Python")

        # 7. Verify Obsolete Non-contract fields are removed
        self.assertNotIn("jobTitle", payload)
        self.assertNotIn("jobDescription", payload)
        self.assertNotIn("skills", payload)
        self.assertNotIn("locations", payload)
        self.assertNotIn("clientName", payload)

    def test_1b_missing_username_raises_validation_error(self):
        """Test 1b: Verify missing Foundit username configuration raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["username"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("username", str(ctx.exception).lower())

    def test_1c_missing_password_raises_validation_error(self):
        """Test 1c: Verify missing Foundit password configuration raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["password"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("password", str(ctx.exception).lower())

    def test_1d_missing_corp_id_raises_validation_error(self):
        """Test 1d: Verify missing Foundit corp_id raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["corp_id"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("corp_id", str(ctx.exception).lower())

    def test_1e_missing_recruiter_id_raises_validation_error(self):
        """Test 1e: Verify missing Foundit recruiter_id raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["recruiter_id"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("recruiter_id", str(ctx.exception).lower())

    def test_1f_missing_company_name_raises_validation_error(self):
        """Test 1f: Verify missing company_name raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["company_name"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("company_name", str(ctx.exception).lower())

    def test_1g_missing_owner_details_raises_validation_error(self):
        """Test 1g: Verify missing owner_name or owner_email raises FounditValidationError safely."""
        creds = dict(self.mock_creds.return_value)
        creds["owner_email"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("owner_email", str(ctx.exception).lower())

    def test_1h_missing_location_id_raises_validation_error(self):
        """Test 1h: Verify unconfirmed location_id raises FounditValidationError without inventing dummy IDs."""
        unconfirmed_job = Application.objects.create(
            candidate_name="",
            position="Senior Python Engineer",
            technology="Python",
            experience=5.0,
            city="UnconfirmedCity",
            state="UnknownState",
            country="India",
            remarks="Experience: 5-8 years."
        )
        creds = dict(self.mock_creds.return_value)
        creds["location_id"] = ""
        creds["default_location_id"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(unconfirmed_job)
        self.assertIn("locationid", str(ctx.exception).lower())

    def test_1i_missing_industry_id_raises_validation_error(self):
        """Test 1i: Verify unconfirmed industry_id raises FounditValidationError without inventing dummy IDs."""
        creds = dict(self.mock_creds.return_value)
        creds["industry_id"] = ""
        creds["default_industry_id"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("industryid", str(ctx.exception).lower())

    def test_1j_missing_role_id_raises_validation_error(self):
        """Test 1j: Verify unconfirmed role_id raises FounditValidationError without inventing dummy IDs."""
        creds = dict(self.mock_creds.return_value)
        creds["role_id"] = ""
        creds["default_role_id"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("roleid", str(ctx.exception).lower())

    def test_1k_missing_salary_raises_validation_error(self):
        """Test 1k: Verify missing salary configuration raises FounditValidationError without assuming 0."""
        creds = dict(self.mock_creds.return_value)
        creds["min_salary"] = ""
        creds["default_min_salary"] = ""
        creds["max_salary"] = ""
        creds["default_max_salary"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("salary", str(ctx.exception).lower())
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

    def test_11_job_30360_network_firewall_skill_extraction_and_unresolved_role_blocker(self):
        """Test 11: Regression test for Job 30360 Network Specialist:
        - Rejects raw job 30360 due to client bill rate/ambiguous pay rate and missing max experience.
        - Sanitized fixture extracts FortiGate, FortiConverter, FortiManager, FortiAnalyzer, Ansible, Python from description.
        - Refuses to use job title as skillName.
        - Refuses to silently assign Software Engineer/Programmer (734) to Network Engineer.
        - Preserves verified Bangalore location mapping (locationId: 2).
        """
        raw_job_30360 = Application.objects.create(
            candidate_name="",
            position="Senior Network / Firewall Specialist & Engineer",
            technology="Senior Network / Firewall Specialist & Engineer",
            experience=6.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Brillio",
            remarks="""[Job Details]
Job Code: PPW - 30360
Client Bill Rate: 150000
Pay Rate: 100000
Start Date: 2026-08-13
End Date: 2026-08-13
Location: Bangalore
Job Status: Active
Job Type: Contract
Client Job ID: Capgemini

[Skills & Assignment]
Description: • Rack, stack, power up, and baseline-configure target FortiGate 1800F devices; integrate with DNS, NTP, SNMP, Syslog, and CMDB.
• Execute FortiOS 7.2.9 upgrades with pre-upgrade health assessments, HA synchronisation validation, and post-upgrade stability monitoring.
• Migrate firewall rules, NAT policies, and routing using FortiConverter; complete rule-by-rule validation against the source configuration.
• Run automated config backup, ping/health-diff, and pre/post validation using Ansible and Python tooling.

Required Skills & Experience
• 5+ years hands-on network/firewall engineering, with strong Fortinet FortiGate operations and upgrade experience.
• Migration/upgradation in Fortinet is mandate +Scripting
• Practical FortiConverter migration, FortiManager/FortiAnalyzer operations, HA, NAT, routing, and policy configuration.
• Scripting/automation experience with Ansible and Python for config provisioning, backup, and validation.
"""
        )

        # 2. Sanitized fixture with explicit annual CTC and explicit experience range
        sanitized_job_30360 = Application.objects.create(
            candidate_name="",
            position="Senior Network / Firewall Specialist & Engineer",
            technology="Senior Network / Firewall Specialist & Engineer",
            experience=6.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Brillio",
            remarks="""[Job Details]
Job Code: PPW - 30360
CTC: 1200000-1500000
Experience: 5-8 years
Location: Bangalore
Job Status: Active
Job Type: Contract
Client Job ID: Capgemini

[Skills & Assignment]
Description: • Rack, stack, power up, and baseline-configure target FortiGate 1800F devices; integrate with DNS, NTP, SNMP, Syslog, and CMDB.
• Execute FortiOS 7.2.9 upgrades with pre-upgrade health assessments, HA synchronisation validation, and post-upgrade stability monitoring.
• Migrate firewall rules, NAT policies, and routing using FortiConverter; complete rule-by-rule validation against the source configuration.
• Run automated config backup, ping/health-diff, and pre/post validation using Ansible and Python tooling.

Required Skills & Experience
• 5-8 years hands-on network/firewall engineering, with strong Fortinet FortiGate operations and upgrade experience.
• Migration/upgradation in Fortinet is mandate +Scripting
• Practical FortiConverter migration, FortiManager/FortiAnalyzer operations, HA, NAT, routing, and policy configuration.
• Scripting/automation experience with Ansible and Python for config provisioning, backup, and validation.
"""
        )

        # A) Without confirmed network role in creds (only generic software default), mapping is blocked
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(raw_job_30360)
        self.assertIn("unresolved foundit roleid for network/security role", str(ctx.exception).lower())

        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(sanitized_job_30360)
        self.assertIn("unresolved foundit roleid for network/security role", str(ctx.exception).lower())

        # B) Configure confirmed network role in creds
        creds = dict(self.mock_creds.return_value)
        creds["network_role_id"] = "801"
        creds["network_role_name"] = "Network Security Engineer"
        creds["network_industry_id"] = "140"
        creds["network_industry_name"] = "IT"
        self.mock_creds.return_value = creds

        # C) Even when network role is configured, raw job still fails safely due to ambiguous salary and missing max experience
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(raw_job_30360)
        self.assertTrue(
            "salary" in str(ctx.exception).lower() or
            "experience" in str(ctx.exception).lower() or
            "client bill rate" in str(ctx.exception).lower()
        )

        # D) Sanitized job succeeds with correct skills, salary, location, experience
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(sanitized_job_30360)

        # Role & Industry
        self.assertEqual(payload["roleList"], [{"roleId": 801, "roleName": "Network Security Engineer", "functionName": "IT"}])

        # Verified Bangalore location
        self.assertEqual(payload["locationList"], [{"locationId": 2, "locationName": "Bengaluru / Bangalore"}])

        # Salary derived from ATS remarks (CTC: 1200000-1500000)
        self.assertEqual(payload["minSalary"], 1200000)
        self.assertEqual(payload["maxSalary"], 1500000)

        # Experience range derived from ATS remarks (5-8)
        self.assertEqual(payload["minExperience"], 5)
        self.assertEqual(payload["maxExperience"], 8)

        # Skills extracted from actual description/requirements, NOT from position title
        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertIn("FortiGate", skill_names)
        self.assertIn("FortiConverter", skill_names)
        self.assertIn("FortiManager", skill_names)
        self.assertIn("FortiAnalyzer", skill_names)
        self.assertIn("Ansible", skill_names)
        self.assertIn("Python", skill_names)
        self.assertNotIn("Senior Network / Firewall Specialist & Engineer", skill_names)

    def test_12_job_trainee_role_mapping(self):
        """Test 12: Verify Trainee role maps to verified roleId 733 (Trainee)."""
        trainee_job = Application.objects.create(
            candidate_name="",
            position="Graduate Software Trainee",
            technology="Java, SQL",
            experience=0.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Test Client",
            remarks="[Job Details]\nCTC: 300000-450000\nExperience: 0-1 years\n"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(trainee_job)
        self.assertEqual(payload["roleList"], [{"roleId": 733, "roleName": "Trainee", "functionName": "IT"}])
        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertIn("Java", skill_names)
        self.assertIn("SQL", skill_names)

    def test_13_unrelated_job_category_without_confirmed_role_is_rejected(self):
        """Test 13: Verify non-software role (e.g. HR Recruiter) is not silently assigned roleId 734."""
        hr_job = Application.objects.create(
            candidate_name="",
            position="Senior HR Recruiter & Talent Acquisition Specialist",
            technology="Talent Acquisition, Sourcing",
            experience=4.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Corporate HR",
            remarks="[Job Details]\nCTC: 400000-600000\nExperience: 4-6 years\n"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(hr_job)
        self.assertIn("unresolved foundit roleid for role", str(ctx.exception).lower())
        self.assertIn("cannot silently assign software engineer/programmer", str(ctx.exception).lower())

    def test_14_location_mapping_preserves_bangalore_and_rejects_unconfirmed_cities(self):
        """Test 14: Verify verified cities resolve correctly while unconfirmed cities raise validation errors."""
        bangalore_job = Application.objects.create(
            candidate_name="",
            position="Backend Developer",
            technology="Go, Postgres",
            experience=3.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Acme",
            remarks="Experience: 3-5 years\n"
        )
        ahmedabad_job = Application.objects.create(
            candidate_name="",
            position="Backend Developer",
            technology="Go, Postgres",
            experience=3.0,
            city="Ahmedabad",
            state="Gujarat",
            country="India",
            client_name="Acme",
            remarks="Experience: 3-5 years\n"
        )
        pune_job = Application.objects.create(
            candidate_name="",
            position="Backend Developer",
            technology="Go, Postgres",
            experience=3.0,
            city="Pune",
            state="Maharashtra",
            country="India",
            client_name="Acme",
            remarks="Experience: 3-5 years\n"
        )
        hyderabad_job = Application.objects.create(
            candidate_name="",
            position="Backend Developer",
            technology="Go, Postgres",
            experience=3.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Acme",
            remarks="Experience: 3-5 years\n"
        )
        unconfirmed_job = Application.objects.create(
            candidate_name="",
            position="Backend Developer",
            technology="Go, Postgres",
            experience=3.0,
            city="Atlantis",
            state="Unknown",
            country="India",
            client_name="Acme",
            remarks="Experience: 3-5 years\n"
        )

        # Bangalore resolves to verified locationId 2
        payload_bgl = FounditJobMapper.map_ats_job_to_foundit_payload(bangalore_job)
        self.assertEqual(payload_bgl["locationList"], [{"locationId": 2, "locationName": "Bengaluru / Bangalore"}])

        # Ahmedabad resolves to verified locationId 1
        payload_ahd = FounditJobMapper.map_ats_job_to_foundit_payload(ahmedabad_job)
        self.assertEqual(payload_ahd["locationList"], [{"locationId": 1, "locationName": "Ahmedabad"}])

        # Pune resolves to verified locationId 10 from official master data
        payload_pune = FounditJobMapper.map_ats_job_to_foundit_payload(pune_job)
        self.assertEqual(payload_pune["locationList"], [{"locationId": 10, "locationName": "Pune"}])

        # Hyderabad resolves to verified locationId 6 from official master data
        payload_hyd = FounditJobMapper.map_ats_job_to_foundit_payload(hyderabad_job)
        self.assertEqual(payload_hyd["locationList"], [{"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"}])

        # Atlantis is unconfirmed in master data and creds, so it must raise FounditValidationError
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(unconfirmed_job)
        self.assertIn("unconfirmed foundit locationid for city 'atlantis'", str(ctx.exception).lower())

    def test_15_salary_fallback_when_ats_record_has_no_salary(self):
        """Test 15: Verify ATS records without salary in remarks fallback to configured environment defaults."""
        job_no_salary = Application.objects.create(
            candidate_name="",
            position="Frontend Engineer",
            technology="React, TypeScript",
            experience=2.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Web Inc",
            remarks="[Job Details]\nLocation: Bangalore\nJob Status: Active\nExperience: 2-5 years\n"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_no_salary)
        # Inherits default min/max from mock creds
        self.assertEqual(payload["minSalary"], 500000)
        self.assertEqual(payload["maxSalary"], 1000000)
        self.assertEqual(payload["salaryConfidential"], "1")

        # When neither ATS record nor creds has salary, raises FounditValidationError
        creds = dict(self.mock_creds.return_value)
        creds["min_salary"] = ""
        creds["default_min_salary"] = ""
        creds["max_salary"] = ""
        creds["default_max_salary"] = ""
        self.mock_creds.return_value = creds
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_no_salary)
        self.assertIn("salary", str(ctx.exception).lower())

    def test_16_apply_url_structure_and_validity(self):
        """Test 16: Verify applyUrl structure adheres to RFC standards and points to valid public job endpoint."""
        from urllib.parse import urlparse, parse_qs
        from django.test import Client

        payload = FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        apply_url = payload["applyUrl"]

        parsed = urlparse(apply_url)
        self.assertIn(parsed.scheme, ("http", "https"))
        self.assertEqual(parsed.netloc, "people-prime.com")
        self.assertEqual(parsed.path, "/job-details")

        qs = parse_qs(parsed.query)
        self.assertEqual(qs.get("id"), [str(self.job.id)])
        self.assertEqual(qs.get("src"), ["Foundit"])

        # Safely test internal public API endpoint for this job without external HTTP requests
        self.job.publish_to_career_page = True
        self.job.status = 'New'
        self.job.save()

        django_client = Client()
        api_response = django_client.get(f"/api/public/jobs/{self.job.id}/")
        self.assertEqual(api_response.status_code, 200)
        self.assertEqual(api_response.json().get("id"), self.job.id)

    def test_15b_salary_fallback_blocks_low_defaults_for_experienced_role(self):
        """Test 15b: Low environment defaults (<= 3 LPA) must block publication for experienced roles (>= 2 yrs)."""
        creds = dict(self.mock_creds.return_value)
        creds["min_salary"] = "100000"
        creds["default_min_salary"] = "100000"
        creds["max_salary"] = "250000"
        creds["default_max_salary"] = "250000"
        self.mock_creds.return_value = creds

        # self.job has experience=5.0 and remarks without explicit salary
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(self.job)
        self.assertIn("misrepresent compensation", str(ctx.exception).lower())

    def test_16b_public_job_details_api_and_data_protection(self):
        """Test 16b: Public job details API exposes only candidate-facing fields and protects private data."""
        from django.test import Client

        self.job.publish_to_career_page = True
        self.job.status = 'New'
        self.job.client_name = 'Confidential Client Inc'
        self.job.remarks = 'INTERNAL ONLY: Bill Rate $95/hr, candidate pay 18 LPA max. Contact recruiter Alice.'
        self.job.save()

        client = Client()
        response = client.get(f"/api/public/jobs/{self.job.id}/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["id"], self.job.id)
        self.assertEqual(data["position"], self.job.position)
        self.assertIn("Python", data["required_skills"])
        self.assertEqual(data["city"], "Hyderabad")

        # Ensure confidential internal fields are never exposed
        self.assertNotIn("remarks", data)
        self.assertNotIn("client_name", data)
        self.assertNotIn("client_bill_rate", data)
        self.assertNotIn("pay_rate", data)
        self.assertNotIn("recruiter", data)
        self.assertNotIn("candidate_name", data)

        # Unapproved or inactive jobs must return 404
        self.job.publish_to_career_page = False
        self.job.save()
        res_unapproved = client.get(f"/api/public/jobs/{self.job.id}/")
        self.assertEqual(res_unapproved.status_code, 404)

    def test_16c_public_job_application_flow_and_file_safeguards(self):
        """Test 16c: Public candidate apply flow validates required fields, resume uploads, and records source."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import Client
        from applications.models import CareerPortalApplicant

        self.job.publish_to_career_page = True
        self.job.status = 'New'
        self.job.save()

        client = Client()

        # Reject invalid file extension (.exe)
        bad_resume = SimpleUploadedFile("malicious.exe", b"binary content", content_type="application/octet-stream")
        bad_payload = {
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane.doe@example.com",
            "mobile_number": "9876543210",
            "qualification": "B.Tech",
            "years_of_experience": "4.5",
            "expected_pay": "1200000",
            "current_ctc": "900000",
            "primary_skills": "Python, Django",
            "current_company": "Tech Corp",
            "city": "Hyderabad",
            "state": "Telangana",
            "accepted_terms": "true",
            "resume": bad_resume,
        }
        res_bad = client.post(f"/api/public/jobs/{self.job.id}/apply/?src=Foundit", bad_payload)
        self.assertEqual(res_bad.status_code, 400)
        self.assertIn("resume", res_bad.json()["errors"])

        # Accept valid PDF resume upload from Foundit (mocking AWS S3 upload and Celery scoring)
        valid_resume = SimpleUploadedFile("jane_resume.pdf", b"%PDF-1.4 sample content", content_type="application/pdf")
        valid_payload = {
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane.doe@example.com",
            "mobile_number": "9876543210",
            "qualification": "B.Tech Computer Science",
            "years_of_experience": "4.5",
            "expected_pay": "1200000",
            "current_ctc": "900000",
            "primary_skills": "Python, Django, AWS",
            "current_company": "Tech Corp",
            "city": "Hyderabad",
            "state": "Telangana",
            "accepted_terms": "true",
            "resume": valid_resume,
        }
        with patch("boto3.client") as mock_boto, patch("applications.ai.tasks.score_applicant_resume_task.delay"):
            res_valid = client.post(f"/api/public/jobs/{self.job.id}/apply/?src=Foundit", valid_payload)
            self.assertEqual(res_valid.status_code, 201)

        # Confirm applicant was recorded with source 'Foundit' and valid resume filename
        applicant = CareerPortalApplicant.objects.filter(job=self.job, email="jane.doe@example.com").first()
        self.assertIsNotNone(applicant)
        self.assertEqual(applicant.source, "Foundit")
        self.assertEqual(applicant.first_name, "Jane")
        self.assertIn("jane_resume.pdf", applicant.resume)

    def test_16d_publish_to_foundit_intent_persistence_and_no_auto_publish(self):
        """Test 16d: Saving job with publish_to_foundit=True records UNPUBLISHED intent and makes no external API calls."""
        from rest_framework.test import APIClient
        from users.models import User, Role
        admin_user = User.objects.create(email='admin_foundit@example.com', full_name='Admin User', role=Role.ADMIN, is_active=True)
        client = APIClient()
        client.force_authenticate(user=admin_user)

        post_data = {
            "client_name": "Acme Corp",
            "position": "Backend Python Developer",
            "technology": "Python, Django",
            "experience": "4.0",
            "city": "Hyderabad",
            "state": "Telangana",
            "country": "India",
            "remarks": "[Job Details]\nJob Code: PPW-9999\nCTC: 12-18 LPA\nExperience: 4-7 years\n",
            "publish_to_career_page": True,
            "publish_to_linkedin": False,
            "publish_to_foundit": True
        }
        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = client.post("/api/applications/", post_data, format="json")
            self.assertEqual(response.status_code, 201)
            # Ensure creating a job does NOT automatically call Foundit API!
            mock_post_job.assert_not_called()

        new_job_id = response.json()["id"]
        # Verify JobBoardPosting was created with UNPUBLISHED status
        posting = JobBoardPosting.objects.filter(job_id=new_job_id, job_board="Foundit").first()
        self.assertIsNotNone(posting)
        self.assertEqual(posting.status, "UNPUBLISHED")
        self.assertEqual(response.json().get("publish_to_foundit"), True)

    def test_16e_validate_and_publish_foundit_authenticated_actions(self):
        """Test 16e: Saved job can subsequently be validated and published via authenticated API workflow."""
        from rest_framework.test import APIClient
        from users.models import User, Role
        admin_user = User.objects.create(email='admin_foundit2@example.com', full_name='Admin User 2', role=Role.ADMIN, is_active=True)
        client = APIClient()
        client.force_authenticate(user=admin_user)

        valid_job = Application.objects.create(
            candidate_name="",
            position="Senior Python Developer",
            technology="Python, Django, PostgreSQL",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Cloud Corp",
            remarks="[Job Details]\nCTC: 1500000-2500000\nExperience: 5-8 years\n",
            publish_to_career_page=True
        )

        # 1. Validate valid job -> 200 OK
        res_val = client.get(f"/api/applications/{valid_job.id}/validate-foundit/")
        self.assertEqual(res_val.status_code, 200)
        self.assertEqual(res_val.json()["valid"], True)

        # 2. Validate invalid job (missing salary remarks with experience >= 2 yrs) -> 400 Bad Request
        invalid_job = Application.objects.create(
            candidate_name="",
            position="Senior Java Architect",
            technology="Java, Spring",
            experience=6.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Legacy Corp",
            remarks="No salary listed.",
            publish_to_career_page=True
        )
        res_inval = client.get(f"/api/applications/{invalid_job.id}/validate-foundit/")
        self.assertEqual(res_inval.status_code, 400)
        self.assertEqual(res_inval.json()["valid"], False)
        self.assertIn("error", res_inval.json())

        # 3. Publish with dry_run=True -> 200 OK without calling external API
        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            res_dry = client.post(f"/api/applications/{valid_job.id}/publish-foundit/", {"dry_run": True}, format="json")
            self.assertEqual(res_dry.status_code, 200)
            self.assertEqual(res_dry.json()["dry_run"], True)
            mock_post_job.assert_not_called()

    def test_17_qa_testing_role_mapping(self):
        """Test 17: Verify QA/Testing positions map to verified roleId 746 (Software Test Engineer)."""
        qa_job = Application.objects.create(
            candidate_name="",
            position="Senior QA Automation & Performance Test Engineer",
            technology="Selenium, JMeter, Python",
            experience=4.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Test Corp",
            remarks="[Job Details]\nCTC: 600000-900000\nExperience: 4-7 years\n"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(qa_job)
        self.assertEqual(payload["roleList"], [{"roleId": 746, "roleName": "Software Test Engineer", "functionName": "IT"}])
        self.assertEqual(payload["locationList"], [{"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"}])

    def test_18_systems_devops_role_mapping(self):
        """Test 18: Verify Systems/DevOps positions map to verified roleId 1077 (Systems Engineer)."""
        devops_job = Application.objects.create(
            candidate_name="",
            position="Senior DevOps and Infrastructure Systems Engineer",
            technology="Kubernetes, Terraform, AWS",
            experience=5.0,
            city="Pune",
            state="Maharashtra",
            country="India",
            client_name="Cloud Corp",
            remarks="[Job Details]\nCTC: 800000-1200000\nExperience: 5-8 years\n"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(devops_job)
        self.assertEqual(payload["roleList"], [{"roleId": 1077, "roleName": "Systems Engineer", "functionName": "IT"}])
        self.assertEqual(payload["locationList"], [{"locationId": 10, "locationName": "Pune"}])

    def test_19_dba_role_mapping(self):
        """Test 19: Verify DBA positions map to verified roleId 740 (Database Administrator (DBA))."""
        dba_job = Application.objects.create(
            candidate_name="",
            position="PostgreSQL Database Administrator (DBA)",
            technology="PostgreSQL, Oracle, SQL",
            experience=6.0,
            city="Chennai",
            state="Tamil Nadu",
            country="India",
            client_name="Data Inc",
            remarks="[Job Details]\nCTC: 700000-1000000\nExperience: 6-9 years\n"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(dba_job)
        self.assertEqual(payload["roleList"], [{"roleId": 740, "roleName": "Database Administrator (DBA)", "functionName": "IT"}])
        self.assertEqual(payload["locationList"], [{"locationId": 3, "locationName": "Chennai"}])

    def test_20_additional_verified_cities_mapping(self):
        """Test 20: Verify multiple major hiring locations map to their verified Foundit master data IDs."""
        cities_to_verify = [
            ("Chennai", 3, "Chennai"),
            ("Mumbai", 8, "Mumbai"),
            ("Noida", 9, "Noida"),
            ("Gurgaon", 5, "Gurgaon / Gurugram"),
            ("Delhi NCR", 199, "Delhi NCR"),
            ("Kolkata", 7, "Kolkata"),
            ("Coimbatore", 41, "Coimbatore"),
            ("Chandigarh", 40, "Chandigarh"),
        ]
        for city_name, expected_id, expected_name in cities_to_verify:
            job = Application.objects.create(
                candidate_name="",
                position="Software Engineer",
                technology="Java",
                experience=2.0,
                city=city_name,
                state="State",
                country="India",
                client_name="Client",
                remarks="Experience: 2-4 years\n"
            )
            payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
            self.assertEqual(
                payload["locationList"],
                [{"locationId": expected_id, "locationName": expected_name}],
                f"City {city_name} failed to resolve to ID {expected_id}"
            )

    # =========================================================================
    # Phase 3C Regression Tests: Tasks 1, 2, 3, 5
    # =========================================================================

    def test_task1_client_bill_rate_never_used_as_candidate_salary(self):
        """Task 1: Verify Client Bill Rate is never used as candidate salary and blocks posting."""
        job_bill_rate = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=3.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Client Bill Rate: 120000\nExperience: 3-6 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_bill_rate)
        self.assertIn("client bill rate", str(ctx.exception).lower())

    def test_task1_ambiguous_pay_rate_fails_safely(self):
        """Task 1: Verify ambiguous Pay Rate without explicit unit fails safely."""
        job_ambiguous_pay = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=3.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Pay Rate: 80000\nExperience: 3-6 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_ambiguous_pay)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())

    def test_task1_explicit_annual_ctc_preserved(self):
        """Task 1: Verify explicit annual CTC range in INR integers is preserved."""
        job_ctc = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=3.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="CTC: 1800000-2400000\nExperience: 3-6 years"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_ctc)
        self.assertEqual(payload["minSalary"], 1800000)
        self.assertEqual(payload["maxSalary"], 2400000)

    def test_task1_explicit_lpa_ctc_preserved(self):
        """Task 1: Verify explicitly labelled LPA CTC range is converted correctly."""
        job_lpa = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=3.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="CTC: 15 - 20 LPA\nExperience: 3-6 years"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_lpa)
        self.assertEqual(payload["minSalary"], 1500000)
        self.assertEqual(payload["maxSalary"], 2000000)

    def test_task2_experience_range_formats(self):
        """Task 2: Verify experience range parsing supports hyphens, 'to', and en-dashes."""
        test_cases = [
            ("Experience: 7-12 years", 7, 12),
            ("Experience: 7 to 12 years", 7, 12),
            ("Experience: 7–12 years", 7, 12),
            ("Experience: 7 - 12", 7, 12),
        ]
        for rem, exp_min, exp_max in test_cases:
            job = Application.objects.create(
                candidate_name="",
                position="Software Engineer",
                technology="Python",
                experience=7.0,
                city="Hyderabad",
                state="Telangana",
                country="India",
                remarks=f"{rem}\nCTC: 1000000-1500000"
            )
            payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
            self.assertEqual(payload["minExperience"], exp_min, f"Failed for {rem}")
            self.assertEqual(payload["maxExperience"], exp_max, f"Failed for {rem}")

    def test_task2_single_minimum_5_plus_fails_safely(self):
        """Task 2: Verify single minimum '5+ years' fails safely without inventing arbitrary max."""
        job_5_plus = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Required: 5+ years experience\nCTC: 1000000-1500000"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_5_plus)
        self.assertIn("maximum experience", str(ctx.exception).lower())

    def test_task2_invalid_experience_range_max_less_than_min(self):
        """Task 2: Verify invalid experience range where max < min raises FounditValidationError."""
        job_invalid_range = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="Python",
            experience=10.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Experience: 10-5 years\nCTC: 1000000-1500000"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_invalid_range)
        self.assertIn("invalid experience range", str(ctx.exception).lower())

    def test_task3_skill_extraction_combined_and_deduplicated(self):
        """Task 3: Verify skills from structured field and description are combined, normalized, and deduplicated."""
        job = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="c#,angular,oracle",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="""Experience: 5-8 years
CTC: 1500000-2000000
Looking for .NET backend development with PL/SQL databases, REST APIs, and system Integration.
Also requires C# and Angular experience.
"""
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
        skill_names = [s["skillName"] for s in payload["skillList"]]
        expected = [".NET", "Angular", "APIs", "C#", "Integration", "Oracle", "PL/SQL"]
        self.assertEqual(sorted(skill_names), sorted(expected))

    def test_task3_optional_skills_distinguished_and_excluded(self):
        """Task 3: Verify optional/preferred skills ('is a plus', 'preferred', 'optional') are excluded from mandatory skillList."""
        job = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="c#,angular",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="""Experience: 5-8 years
CTC: 1500000-2000000
Mandatory skills: C# and Angular.
Python is a plus. AWS knowledge is preferred. Docker is optional.
"""
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertIn("C#", skill_names)
        self.assertIn("Angular", skill_names)
        self.assertNotIn("Python", skill_names)
        self.assertNotIn("AWS", skill_names)
        self.assertNotIn("Docker", skill_names)

    def test_task3_generic_title_not_added_as_skill(self):
        """Task 3: Prevent complete job title from being added as technical skill."""
        job = Application.objects.create(
            candidate_name="",
            position="Senior Software Engineer",
            technology="Senior Software Engineer",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Experience: 5-8 years\nCTC: 2000000-3000000\nKey technical skills include Python, AWS, Docker."
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job)
        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertNotIn("Senior Software Engineer", skill_names)
        self.assertIn("Python", skill_names)

    def test_task3_missing_skills_raises_validation_error(self):
        """Task 3: Verify missing or unrecognized skills safely raises FounditValidationError."""
        job = Application.objects.create(
            candidate_name="",
            position="Software Engineer",
            technology="",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            remarks="Experience: 5-8 years\nCTC: 1000000-1500000\nRole with no technical keywords."
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job)
        self.assertIn("skills", str(ctx.exception).lower())

    def test_task5_job_41522_sanitized_fixture(self):
        """Task 5: Sanitized fixture regression test for Job 41522 (Fulltime- Senior Fullstack Developer):
        - CTC: 2000000-3000000 preserved.
        - Experience 7-12 parsed correctly.
        - C#, Angular, Oracle from technology + .NET, PL/SQL, APIs, Integration combined.
        - Python excluded as optional ('Python is a plus').
        - Role mapped to 734 (Software Engineer).
        - Location Bangalore mapped to 2.
        """
        job_41522 = Application.objects.create(
            candidate_name="",
            position="Fulltime- Senior Fullstack Developer",
            technology="c#,angular,oracle",
            experience=7.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Capgemini",
            remarks="""[Job Details]
Job Code: PPW - 41522
CTC: 2000000-3000000
Experience: 7-12
Location: Bangalore
Job Status: Active
Job Type: Full Time

[Skills & Assignment]
Description: Primary skills: C#, Angular, Oracle PL/SQL, .NET Core.
Building robust APIs and backend Integration.
Python is a plus.
"""
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_41522)
        self.assertEqual(payload["minSalary"], 2000000)
        self.assertEqual(payload["maxSalary"], 3000000)
        self.assertEqual(payload["minExperience"], 7)
        self.assertEqual(payload["maxExperience"], 12)
        self.assertEqual(payload["roleList"], [{"roleId": 734, "roleName": "Software Engineer", "functionName": "IT"}])
        self.assertEqual(payload["locationList"], [{"locationId": 2, "locationName": "Bengaluru / Bangalore"}])

        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertIn("C#", skill_names)
        self.assertIn("Angular", skill_names)
        self.assertIn("Oracle", skill_names)
        self.assertIn(".NET", skill_names)
        self.assertIn("PL/SQL", skill_names)
        self.assertIn("APIs", skill_names)
        self.assertIn("Integration", skill_names)
        self.assertNotIn("Python", skill_names)
        self.assertNotIn("Fulltime- Senior Fullstack Developer", skill_names)

    def test_task5_job_30360_sanitized_fixture(self):
        """Task 5: Sanitized fixture regression test for Job 30360 (Senior Network / Firewall Specialist & Engineer):
        - Raw job with Client Bill Rate / Pay Rate and 5+ years fails validation safely.
        - Sanitized job with CTC 12-15 LPA and Experience 5-8 years succeeds with network role.
        """
        # Configure confirmed network role in credentials
        creds = dict(self.mock_creds.return_value)
        creds["network_role_id"] = "801"
        creds["network_role_name"] = "Network Security Engineer"
        creds["network_industry_id"] = "140"
        creds["network_industry_name"] = "IT"
        self.mock_creds.return_value = creds

        sanitized_30360 = Application.objects.create(
            candidate_name="",
            position="Senior Network / Firewall Specialist & Engineer",
            technology="Senior Network / Firewall Specialist & Engineer",
            experience=6.0,
            city="Bangalore",
            state="Karnataka",
            country="India",
            client_name="Brillio",
            remarks="""[Job Details]
Job Code: PPW - 30360
CTC: 1200000-1500000
Experience: 5-8 years
Location: Bangalore
Job Status: Active
Job Type: Contract

[Skills & Assignment]
Description: • Rack, stack, power up, and baseline-configure target FortiGate 1800F devices; integrate with DNS, NTP, SNMP, Syslog, and CMDB.
• Execute FortiOS 7.2.9 upgrades with pre-upgrade health assessments, HA synchronisation validation, and post-upgrade stability monitoring.
• Migrate firewall rules, NAT policies, and routing using FortiConverter; complete rule-by-rule validation against the source configuration.
• Run automated config backup, ping/health-diff, and pre/post validation using Ansible and Python tooling.

Required Skills & Experience
• 5-8 years hands-on network/firewall engineering, with strong Fortinet FortiGate operations and upgrade experience.
• Migration/upgradation in Fortinet is mandate +Scripting
• Practical FortiConverter migration, FortiManager/FortiAnalyzer operations, HA, NAT, routing, and policy configuration.
• Scripting/automation experience with Ansible and Python for config provisioning, backup, and validation.
"""
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(sanitized_30360)
        self.assertEqual(payload["minSalary"], 1200000)
        self.assertEqual(payload["maxSalary"], 1500000)
        self.assertEqual(payload["minExperience"], 5)
        self.assertEqual(payload["maxExperience"], 8)
        self.assertEqual(payload["roleList"], [{"roleId": 801, "roleName": "Network Security Engineer", "functionName": "IT"}])
        self.assertEqual(payload["locationList"], [{"locationId": 2, "locationName": "Bengaluru / Bangalore"}])

        skill_names = [s["skillName"] for s in payload["skillList"]]
        self.assertIn("FortiGate", skill_names)
        self.assertIn("FortiConverter", skill_names)
        self.assertIn("FortiManager", skill_names)
        self.assertIn("FortiAnalyzer", skill_names)
        self.assertIn("Ansible", skill_names)
        self.assertIn("Python", skill_names)
        self.assertNotIn("Senior Network / Firewall Specialist & Engineer", skill_names)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditClientBudgetSalaryTests(TestCase):
    """
    Comprehensive regression tests for client-approved job budget salary validation:
    1. Explicitly annual client-approved budget (ranges and single amounts).
    2. Valid annual minimum and maximum preservation and inverted range normalization.
    3. Explicit monthly or hourly budget blocked without approved conversion rule.
    4. Missing or ambiguous salary period blocked with informative guidance.
    5. Missing or ambiguous currency (foreign currencies blocked, requiring INR).
    6. Single-value budgets that lack a valid documented mapping blocked safely.
    7. Client Bill Rate never used as candidate salary or advertised budget.
    8. Candidate-specific salary never replacing the advertised job budget.
    9. Existing experienced-job safeguards against low fallback defaults.
    10. Unrelated validations (experience, skills) and LinkedIn XML feed regression.
    """

    def setUp(self):
        self.creds_patcher = patch("applications.integrations.foundit.mappers.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "username": "test_username",
            "password": "test_password",
            "corp_id": "188533",
            "recruiter_id": "1220898",
            "channel_id": "1",
            "sub_channel_id": "1",
            "company_name": "People Prime Worldwide",
            "owner_name": "Test Owner",
            "owner_email": "owner@people-prime.com",
            "default_location_id": "6",
            "default_location_name": "Hyderabad / Secunderabad, Telangana",
            "default_industry_id": "140",
            "default_industry_name": "Consumer Software",
            "default_role_id": "734",
            "default_role_name": "Software Engineer",
            "default_function_name": "IT",
            "default_min_salary": "500000",
            "default_max_salary": "1000000",
            "default_currency_id": "1",
            "default_salary_confidential": "1",
            "api_key": "test_key",
        }
        self.addCleanup(self.creds_patcher.stop)

    def _create_job(self, remarks="", experience=3.0, position="Backend Developer", technology="Python, Django"):
        return Application.objects.create(
            candidate_name="",
            position=position,
            technology=technology,
            experience=experience,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Acme Tech Solutions",
            remarks=remarks
        )

    def test_1_explicitly_annual_client_approved_budget(self):
        """1. Explicitly annual client-approved budget maps correctly to Foundit salary fields."""
        # Range with LPA
        job_lpa_range = self._create_job(remarks="Pay Rate: 15-20 LPA\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_lpa_range)
        self.assertEqual(payload["minSalary"], 1500000)
        self.assertEqual(payload["maxSalary"], 2000000)

        # Range with explicit per annum
        job_pa_range = self._create_job(remarks="Pay Rate / Salary: 1800000 - 2400000 per annum\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_pa_range)
        self.assertEqual(payload["minSalary"], 1800000)
        self.assertEqual(payload["maxSalary"], 2400000)

        # Client Budget syntax with Lakhs
        job_budget = self._create_job(remarks="Client Budget: 12 to 16 Lakhs\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_budget)
        self.assertEqual(payload["minSalary"], 1200000)
        self.assertEqual(payload["maxSalary"], 1600000)

    def test_2_valid_annual_minimum_and_maximum(self):
        """2. Valid annual min and max are preserved; inverted ranges are normalized; single amounts set min=max."""
        # Inverted range normalized
        job_inverted = self._create_job(remarks="Pay Rate: 22-18 LPA\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_inverted)
        self.assertEqual(payload["minSalary"], 1800000)
        self.assertEqual(payload["maxSalary"], 2200000)

        # Single annual LPA amount preserves verified amount without inventing arbitrary maximum
        job_single_lpa = self._create_job(remarks="Pay Rate: 15 LPA\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_single_lpa)
        self.assertEqual(payload["minSalary"], 1500000)
        self.assertEqual(payload["maxSalary"], 1500000)

        # Single integer with PA keyword
        job_single_pa = self._create_job(remarks="Pay Rate: 1600000 PA\nExperience: 3-5 years")
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_single_pa)
        self.assertEqual(payload["minSalary"], 1600000)
        self.assertEqual(payload["maxSalary"], 1600000)

    def test_3_explicit_monthly_or_hourly_budget_blocked(self):
        """3. Explicit monthly or hourly budget without approved conversion rules blocks publication."""
        job_monthly = self._create_job(remarks="Pay Rate: 80,000 per month\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_monthly)
        err = str(ctx.exception)
        self.assertIn("monthly", err.lower())
        self.assertIn("client-approved", err.lower())
        self.assertIn("annual", err.lower())

        job_hourly = self._create_job(remarks="Pay Rate: 750/hr\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_hourly)
        err = str(ctx.exception)
        self.assertIn("hourly", err.lower())
        self.assertIn("client-approved", err.lower())
        self.assertIn("annual", err.lower())

    def test_4_missing_or_ambiguous_salary_period(self):
        """4. Missing or ambiguous salary period blocks publication and explains missing information."""
        job_ambiguous = self._create_job(remarks="Pay Rate: 85000\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_ambiguous)
        err = str(ctx.exception)
        self.assertIn("ambiguous salary unit", err.lower())
        self.assertIn("client-approved job budget", err.lower())
        self.assertIn("pay period", err.lower())
        self.assertIn("client bill rate cannot be used as candidate salary", err.lower())

        job_budget_ambiguous = self._create_job(remarks="Budget: 50000\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_budget_ambiguous)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())

    def test_5_missing_or_foreign_currency(self):
        """5. Unsupported or foreign currency blocks publication, demanding INR confirmation."""
        currencies = ["Pay Rate: $80/hr", "Budget: 5000 USD", "Pay Rate: €4000/month", "Budget: £60000"]
        for rem in currencies:
            job = self._create_job(remarks=f"{rem}\nExperience: 3-5 years")
            with self.assertRaises(FounditValidationError) as ctx:
                FounditJobMapper.map_ats_job_to_foundit_payload(job)
            err = str(ctx.exception)
            self.assertIn("unsupported or foreign currency", err.lower())
            self.assertIn("inr", err.lower())

    def test_6_single_value_budget_lacking_valid_documented_mapping(self):
        """6. Single-value budget lacking a verified annual unit is blocked rather than silently presumed annual."""
        job_bare_int = self._create_job(remarks="Pay Rate: 1500000\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_bare_int)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())

    def test_7_client_bill_rate_never_used_as_salary(self):
        """7. Client Bill Rate is never used as candidate compensation and blocks publication."""
        job_bill_only = self._create_job(remarks="Client Bill Rate: 150000\nExperience: 3-5 years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_bill_only)
        err = str(ctx.exception)
        self.assertIn("client bill rate cannot be used as candidate salary", err.lower())

        job_bill_and_ambiguous_pay = self._create_job(
            remarks="Client Bill Rate: 150000\nPay Rate: 75000\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_bill_and_ambiguous_pay)
        err = str(ctx.exception)
        self.assertIn("client bill rate cannot be used as candidate salary", err.lower())

    def test_8_candidate_specific_salary_never_replaces_advertised_job_budget(self):
        """8. Candidate-specific salary never replaces the advertised client-approved job budget."""
        # Candidate record remarks containing candidate's CTC details but no job budget
        job_candidate_ctc = self._create_job(
            remarks="Candidate: John Doe\nCurrent CTC: 12 LPA\nExpected CTC: 18 LPA\nPay Rate: 80000\nExperience: 3-5 years"
        )
        # Even though remarks mention '12 LPA' and '18 LPA' for the candidate, the job's Pay Rate is ambiguous (80000)
        # Publication must be blocked and NOT use candidate's Current/Expected CTC as the job budget
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_candidate_ctc)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())

    def test_9_experienced_job_safeguards_against_unsafe_fallback_values(self):
        """9. Fallback environment salary defaults cannot be silently applied to experienced roles (>= 2 yrs)."""
        job_exp_no_sal = self._create_job(
            remarks="Experience: 5-8 years",
            experience=5.0
        )
        # Override creds with low fallback (e.g. 1.0 - 2.5 LPA)
        self.mock_creds.return_value["min_salary"] = "100000"
        self.mock_creds.return_value["max_salary"] = "250000"
        self.mock_creds.return_value["default_min_salary"] = "100000"
        self.mock_creds.return_value["default_max_salary"] = "250000"

        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_exp_no_sal)
        err = str(ctx.exception)
        self.assertIn("misrepresent compensation for an experienced role", err.lower())
        self.assertIn("explicit client-approved job budget must be provided", err.lower())

    def test_10_unrelated_validations_and_linkedin_feed_regression(self):
        """10. Unrelated validations (experience, skills) and LinkedIn XML feed endpoint remain unaffected."""
        # Unconfirmed experience range fails safely
        job_bad_exp = self._create_job(remarks="Pay Rate: 15-20 LPA\nExperience: 5+ years")
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_bad_exp)
        self.assertIn("lacks an established maximum experience range", str(ctx.exception).lower())

        # LinkedIn XML feed endpoint returns HTTP 200 with valid structure
        from applications.public_views import PublicLinkedInJobXmlFeedAPIView
        factory = RequestFactory()
        request = factory.get('/api/public/jobs/linkedin-feed.xml')
        view = PublicLinkedInJobXmlFeedAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/xml; charset=utf-8')
        content = response.content.decode('utf-8')
        self.assertIn('<source>', content)

    def test_11_backend_rate_validation_rejects_malformed_values(self):
        """11. Backend API serializer rejects values < 5 digits, non-digits, and decimals, accepting valid 5+ digit rates."""
        from applications.serializers import ApplicationSerializer

        base_data = {
            "client_name": "Test Client",
            "position": "Software Engineer",
            "technology": "Python",
            "experience": 3.0,
            "country": "India",
            "city": "Hyderabad",
        }

        # Submitting rate < 5 digits via write-only field
        s1 = ApplicationSerializer(data={**base_data, "client_bill_rate": "9999"})
        self.assertFalse(s1.is_valid())
        self.assertIn("client_bill_rate", s1.errors)
        self.assertIn("Enter a numeric amount containing at least 5 digits.", str(s1.errors["client_bill_rate"]))

        # Submitting alphabetic rate
        s2 = ApplicationSerializer(data={**base_data, "pay_rate": "12ab56"})
        self.assertFalse(s2.is_valid())
        self.assertIn("pay_rate", s2.errors)
        self.assertIn("Enter a numeric amount containing at least 5 digits.", str(s2.errors["pay_rate"]))

        # Submitting decimal rate
        s3 = ApplicationSerializer(data={**base_data, "pay_rate": "25000.50"})
        self.assertFalse(s3.is_valid())
        self.assertIn("pay_rate", s3.errors)
        self.assertIn("Enter a numeric amount containing at least 5 digits.", str(s3.errors["pay_rate"]))

        # Submitting rate with spaces
        s4 = ApplicationSerializer(data={**base_data, "client_bill_rate": " 250000"})
        self.assertFalse(s4.is_valid())
        self.assertIn("client_bill_rate", s4.errors)

        # Submitting malformed values inside remarks
        s5 = ApplicationSerializer(data={**base_data, "remarks": "Client Bill Rate: 9999\nPay Rate: 1500000"})
        self.assertFalse(s5.is_valid())
        self.assertIn("client_bill_rate", s5.errors)

        s6 = ApplicationSerializer(data={**base_data, "remarks": "Client Bill Rate: 120000\nPay Rate: 12ab56"})
        self.assertFalse(s6.is_valid())
        self.assertIn("pay_rate", s6.errors)

        # Valid 5+ digit integer values are accepted
        s7 = ApplicationSerializer(data={**base_data, "client_bill_rate": "250000", "pay_rate": "1500000"})
        self.assertTrue(s7.is_valid(), f"Expected valid but got errors: {s7.errors}")

        # Optional empty fields remain optional
        s8 = ApplicationSerializer(data={**base_data, "client_bill_rate": "", "pay_rate": ""})
        self.assertTrue(s8.is_valid(), f"Expected valid empty rates but got: {s8.errors}")

    def test_12_budget_metadata_persistence_and_per_annum_mapping(self):
        """12. Verified Per Annum budget period with explicit client budget confirmation maps numeric Pay Rate to Foundit salary."""
        # Single 5+ digit budget with confirmed Per Annum period and explicit client confirmation
        job_annual_single = self._create_job(
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nSalary Currency: INR\nExperience: 3-5 years"
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_annual_single)
        self.assertEqual(payload["minSalary"], 1500000)
        self.assertEqual(payload["maxSalary"], 1500000)
        self.assertEqual(payload["currencyId"], 1)

        # Numeric range budget with confirmed Per Annum period and explicit client confirmation
        job_annual_range = self._create_job(
            remarks="Pay Rate: 1200000 - 1800000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nSalary Currency: INR\nExperience: 3-5 years"
        )
        payload_range = FounditJobMapper.map_ats_job_to_foundit_payload(job_annual_range)
        self.assertEqual(payload_range["minSalary"], 1200000)
        self.assertEqual(payload_range["maxSalary"], 1800000)

    def test_13_budget_metadata_period_blocks_monthly_hourly_unknown(self):
        """13. Explicit metadata periods for Per Month, Per Hour, and Unknown safely block Foundit posting."""
        # Monthly metadata blocked
        job_monthly = self._create_job(
            remarks="Pay Rate: 80000\nSalary Period: Per Month\nSalary Currency: INR\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_monthly)
        self.assertIn("monthly", str(ctx.exception).lower())

        # Hourly metadata blocked
        job_hourly = self._create_job(
            remarks="Pay Rate: 1000\nSalary Period: Per Hour\nSalary Currency: INR\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_hourly)
        self.assertIn("hourly", str(ctx.exception).lower())

        # Unknown metadata blocked
        job_unknown = self._create_job(
            remarks="Pay Rate: 1500000\nSalary Period: Unknown\nSalary Currency: INR\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_unknown)
        self.assertIn("unknown or unconfirmed pay period", str(ctx.exception).lower())

        # Missing metadata on bare integer (historical records) blocked
        job_no_period = self._create_job(
            remarks="Pay Rate: 1500000\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_no_period)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())

    def test_14_budget_metadata_unsupported_currency_blocked(self):
        """14. Explicit metadata with foreign currency (USD, EUR) blocks Foundit publication demanding INR."""
        job_usd = self._create_job(
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nSalary Currency: USD\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_usd)
        self.assertIn("unsupported or foreign currency", str(ctx.exception).lower())
        self.assertIn("usd", str(ctx.exception).lower())

        job_eur = self._create_job(
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nSalary Currency: EUR\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_eur)
        self.assertIn("unsupported or foreign currency", str(ctx.exception).lower())
        self.assertIn("eur", str(ctx.exception).lower())

    def test_15_create_and_edit_api_flow_enforces_rate_rules(self):
        """15. Both create and update serializer operations enforce the identical 5-digit rate validation rules."""
        from applications.serializers import ApplicationSerializer

        base_data = {
            "client_name": "Test Client Corp",
            "position": "Lead DevOps",
            "technology": "AWS, Kubernetes",
            "experience": 5.0,
            "country": "India",
            "city": "Hyderabad",
            "remarks": "[Job Details]\nJob Code: PPW-1111\nClient Bill Rate: 120000\nPay Rate: 1500000\nSalary Currency: INR\nSalary Period: Per Annum\nClient Budget Confirmed: Yes"
        }

        # 1. Create mode via serializer
        s_create = ApplicationSerializer(data=base_data)
        self.assertTrue(s_create.is_valid(), f"Creation errors: {s_create.errors}")
        app = s_create.save()
        self.assertIn("Client Bill Rate: 120000", app.remarks)
        self.assertIn("Pay Rate: 1500000", app.remarks)

        # 2. Edit mode: attempting to update with invalid rate in remarks fails
        s_edit_invalid = ApplicationSerializer(
            instance=app,
            data={**base_data, "remarks": "[Job Details]\nJob Code: PPW-1111\nClient Bill Rate: 120000\nPay Rate: 9999"}
        )
        self.assertFalse(s_edit_invalid.is_valid())
        self.assertIn("pay_rate", s_edit_invalid.errors)

        # 3. Edit mode: valid update succeeds
        s_edit_valid = ApplicationSerializer(
            instance=app,
            data={**base_data, "remarks": "[Job Details]\nJob Code: PPW-1111\nClient Bill Rate: 150000\nPay Rate: 1800000\nSalary Currency: INR\nSalary Period: Per Annum\nClient Budget Confirmed: Yes"}
        )
        self.assertTrue(s_edit_valid.is_valid())
        updated_app = s_edit_valid.save()
        self.assertIn("Pay Rate: 1800000", updated_app.remarks)

    def test_16_historical_record_without_budget_metadata_defaults_unknown_and_blocks_foundit(self):
        """16. Historical records (e.g. job #68777) lacking budget metadata default to Unknown and remain blocked from Foundit."""
        # Historical record with bare numeric Pay Rate and no metadata
        historical_job = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-68777\nClient Bill Rate: 200000\nPay Rate: 1500000\nExperience: 4-7 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(historical_job)
        self.assertIn("ambiguous salary unit", str(ctx.exception).lower())
        self.assertIn("client bill rate cannot be used as candidate salary", str(ctx.exception).lower())

        # Historical record loaded into ATS with Unknown budget period
        historical_unknown = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-68777\nPay Rate: 1500000\nSalary Period: Unknown\nExperience: 4-7 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(historical_unknown)
        self.assertIn("unknown or unconfirmed pay period", str(ctx.exception).lower())

    def test_17_unconfirmed_per_annum_period_requires_explicit_recruiter_confirmation(self):
        """17. Ambiguous historical budget updated to Per Annum without explicit confirmation is blocked."""
        # Recruiter selects Per Annum but has not explicitly confirmed client budget approval
        unconfirmed_job = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-68777\nPay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: No\nExperience: 4-7 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(unconfirmed_job)
        err = str(ctx.exception)
        self.assertIn("requires explicit recruiter confirmation", err)
        self.assertIn("the selected period must reflect the actual client-approved budget", err.lower())

        # Missing confirmation line on bare numeric budget also blocked
        missing_confirm_job = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-68777\nPay Rate: 1500000\nSalary Period: Per Annum\nExperience: 4-7 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(missing_confirm_job)
        err = str(ctx.exception)
        self.assertIn("requires explicit recruiter confirmation", err)
        self.assertIn("the selected period must reflect the actual client-approved budget", err.lower())

    def test_18_client_bill_rate_and_candidate_salary_never_fallback_for_job_budget(self):
        """18. Client Bill Rate and candidate-specific salaries are never used as fallback for job budget."""
        # Record with only Client Bill Rate
        job_only_bill_rate = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-7777\nClient Bill Rate: 250000\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_only_bill_rate)
        self.assertIn("client bill rate cannot be used as candidate salary", str(ctx.exception).lower())

        # Record with candidate-specific CTCs
        job_candidate_ctc = self._create_job(
            remarks="[Job Details]\nJob Code: PPW-7777\nCurrent CTC: 1200000\nExpected CTC: 1800000\nCandidate CTC: 1500000\nExperience: 3-5 years"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_candidate_ctc)
        self.assertIn("candidate-specific salary cannot be used", str(ctx.exception).lower())

    def test_19_serializer_client_budget_confirmed_field_persistence(self):
        """19. ApplicationSerializer accepts client_budget_confirmed write-only field and persists it in remarks."""
        from applications.serializers import ApplicationSerializer

        base_data = {
            "client_name": "Acme Systems",
            "position": "Senior Backend Developer",
            "technology": "Python, Django",
            "experience": 4.0,
            "country": "India",
            "city": "Bengaluru",
            "client_bill_rate": "250000",
            "pay_rate": "1600000",
            "salary_currency": "INR",
            "salary_period": "Per Annum",
            "client_budget_confirmed": "Yes",
            "remarks": "[Job Details]\nJob Code: PPW-9090\nPay Rate: 1600000\nSalary Currency: INR\nSalary Period: Per Annum\nClient Budget Confirmed: Yes"
        }

        serializer = ApplicationSerializer(data=base_data)
        self.assertTrue(serializer.is_valid(), f"Serializer errors: {serializer.errors}")
        app = serializer.save()
        self.assertIn("Client Budget Confirmed: Yes", app.remarks)
        self.assertIn("Salary Period: Per Annum", app.remarks)

    def test_20_experience_mapping_valid_range_minimum_and_maximum(self):
        """20. Confirmed minimum experience and maximum experience map to minExperience and maxExperience."""
        # 1. Experience specified via Max Experience line in remarks
        job_with_max_exp = self._create_job(
            experience=5.0,
            remarks=(
                "[Job Details]\nPay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\n"
                "[Skills & Assignment]\nExperience: 5 - 8 years\nMax Experience: 8\n"
            )
        )
        payload = FounditJobMapper.map_ats_job_to_foundit_payload(job_with_max_exp)
        self.assertEqual(payload["minExperience"], 5)
        self.assertEqual(payload["maxExperience"], 8)

        # 2. Experience range specified via structured attribute max_experience
        job_structured = self._create_job(
            experience=4.0,
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes"
        )
        job_structured.max_experience = 7
        payload_struct = FounditJobMapper.map_ats_job_to_foundit_payload(job_structured)
        self.assertEqual(payload_struct["minExperience"], 4)
        self.assertEqual(payload_struct["maxExperience"], 7)

    def test_21_missing_maximum_experience_blocks_foundit(self):
        """21. Jobs with only minimum experience lack upper bound and remain blocked from Foundit posting."""
        job_only_min = self._create_job(
            experience=5.0,
            remarks="[Job Details]\nPay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\n[Skills & Assignment]\nDegree: B.Tech"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_only_min)
        err = str(ctx.exception).lower()
        self.assertIn("foundit requires both minexperience and maxexperience", err)
        self.assertIn("explicit maximum experience must be provided", err)

    def test_22_maximum_experience_lower_than_minimum_rejected(self):
        """22. Maximum experience lower than minimum experience is rejected by both mapper and serializer."""
        # Mapper rejection
        job_inverted = self._create_job(
            experience=6.0,
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nMax Experience: 3"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_inverted)
        self.assertIn("maximum experience 3 is less than minimum experience 6", str(ctx.exception).lower())

        # Serializer rejection
        from applications.serializers import ApplicationSerializer
        s = ApplicationSerializer(data={
            "client_name": "Acme",
            "position": "Python Dev",
            "technology": "Python",
            "country": "India",
            "city": "Hyderabad",
            "experience": 5.0,
            "max_experience": "3"
        })
        self.assertFalse(s.is_valid())
        self.assertIn("max_experience", s.errors)
        self.assertIn("greater than or equal to minimum experience", str(s.errors["max_experience"]).lower())

    def test_23_negative_and_malformed_experience_rejected(self):
        """23. Negative and malformed experience values are rejected by serializer and mapper."""
        from applications.serializers import ApplicationSerializer

        # Serializer rejects negative max_experience
        s_neg = ApplicationSerializer(data={
            "client_name": "Acme",
            "position": "Python Dev",
            "technology": "Python",
            "country": "India",
            "city": "Hyderabad",
            "experience": 3.0,
            "max_experience": "-2"
        })
        self.assertFalse(s_neg.is_valid())
        self.assertIn("max_experience", s_neg.errors)

        # Serializer rejects decimal/alphabetic max_experience
        s_alpha = ApplicationSerializer(data={
            "client_name": "Acme",
            "position": "Python Dev",
            "technology": "Python",
            "country": "India",
            "city": "Hyderabad",
            "experience": 3.0,
            "max_experience": "eight"
        })
        self.assertFalse(s_alpha.is_valid())
        self.assertIn("max_experience", s_alpha.errors)

        # Mapper rejects negative max in remarks
        job_neg = self._create_job(
            experience=3.0,
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nMax Experience: -5"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_neg)
        self.assertIn("cannot be negative", str(ctx.exception).lower())

        # Mapper rejects malformed max in remarks
        job_mal = self._create_job(
            experience=3.0,
            remarks="Pay Rate: 1500000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\nMax Experience: abc"
        )
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(job_mal)
        self.assertIn("malformed maximum experience", str(ctx.exception).lower())

    def test_24_create_and_edit_flows_preserve_both_experience_values(self):
        """24. Serializer create and edit flows accept and preserve both min and max experience."""
        from applications.serializers import ApplicationSerializer

        # 1. Create with max_experience
        create_data = {
            "client_name": "Tech Corp",
            "position": "Backend Engineer",
            "technology": "Django, Postgres",
            "country": "India",
            "city": "Hyderabad",
            "experience": 4.0,
            "max_experience": "7",
            "remarks": "[Job Details]\nJob Code: PPW-5001\nPay Rate: 1200000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\n[Skills & Assignment]\nExperience: 4 - 7 years\nMax Experience: 7"
        }
        s_create = ApplicationSerializer(data=create_data)
        self.assertTrue(s_create.is_valid(), f"Create errors: {s_create.errors}")
        app = s_create.save()
        self.assertEqual(float(app.experience), 4.0)
        self.assertIn("Max Experience: 7", app.remarks)

        # 2. Edit to update max_experience
        edit_data = {
            **create_data,
            "experience": 5.0,
            "max_experience": "9",
            "remarks": "[Job Details]\nJob Code: PPW-5001\nPay Rate: 1200000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes\n[Skills & Assignment]\nExperience: 5 - 9 years\nMax Experience: 9"
        }
        s_edit = ApplicationSerializer(instance=app, data=edit_data)
        self.assertTrue(s_edit.is_valid(), f"Edit errors: {s_edit.errors}")
        updated = s_edit.save()
        self.assertEqual(float(updated.experience), 5.0)
        self.assertIn("Max Experience: 9", updated.remarks)

    def test_25_historical_job_with_only_minimum_readable_but_not_eligible_for_foundit(self):
        """25. Historical jobs containing only a minimum experience value load cleanly but are blocked from Foundit."""
        from applications.serializers import ApplicationSerializer

        # Historical job with experience=5.0 and no max_experience in remarks or fields
        historical_job = Application.objects.create(
            candidate_name="",
            position="Senior Java Developer",
            technology="Java, Spring Boot",
            experience=5.0,
            country="India",
            city="Bengaluru",
            client_name="Global Bank",
            remarks="[Job Details]\nJob Code: PPW-2020\nPay Rate: 1800000\nSalary Period: Per Annum\nClient Budget Confirmed: Yes"
        )

        # Serializer reads historical record without error
        serializer = ApplicationSerializer(instance=historical_job)
        self.assertEqual(float(serializer.data["experience"]), 5.0)

        # But Foundit publication is safely blocked
        with self.assertRaises(FounditValidationError) as ctx:
            FounditJobMapper.map_ats_job_to_foundit_payload(historical_job)
        self.assertIn("foundit requires both minexperience and maxexperience", str(ctx.exception).lower())

    def test_26_existing_non_foundit_workflows_continue_without_max_experience(self):
        """26. Existing non-Foundit job creation and updates continue to succeed without max_experience."""
        from applications.serializers import ApplicationSerializer

        base_data = {
            "client_name": "Standard Client",
            "position": "Frontend Developer",
            "technology": "React, TypeScript",
            "country": "India",
            "city": "Bengaluru",
            "experience": 2.5
        }
        s = ApplicationSerializer(data=base_data)
        self.assertTrue(s.is_valid(), f"Standard creation failed: {s.errors}")
        app = s.save()
        self.assertEqual(float(app.experience), 2.5)

        # Foundit publication attempt fails if max_experience is missing
        s_foundit = ApplicationSerializer(instance=app, data={**base_data, "publish_to_foundit": True})
        self.assertFalse(s_foundit.is_valid())
        self.assertIn("max_experience", s_foundit.errors)



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
        self.assertIn("execution is blocked", str(ctx.exception))

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
            limit=1,
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


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditPhase4SafetyAndConcurrencyTests(TestCase):
    """
    Regression test suite for Foundit Phase 4 Safety Fixes:
    - Fix 1: publish endpoint safety (safe dry_run default, strict boolean typing, confirm_live mandate)
    - Fix 2: concurrency safety and in-flight duplicate prevention
    - Fix 3: regression coverage for external API insulation and mock transport
    - Fix 4: strict operational role permissions for validation and publishing
    """

    def setUp(self):
        from users.models import User, Role
        self.admin_user = User.objects.create(
            email='phase4_admin@example.com',
            full_name='Phase4 Admin',
            role=Role.ADMIN,
            is_active=True
        )
        self.team_lead_user = User.objects.create(
            email='phase4_teamlead@example.com',
            full_name='Phase4 Team Lead',
            role=Role.TEAM_LEAD,
            is_active=True
        )
        self.associate_user = User.objects.create(
            email='phase4_associate@example.com',
            full_name='Phase4 Associate',
            role=Role.ASSOCIATE_ANALYST,
            is_active=True
        )
        self.reporting_user = User.objects.create(
            email='phase4_reporting@example.com',
            full_name='Phase4 Reporting',
            role=Role.REPORTING_TEAM,
            is_active=True
        )

        self.job = Application.objects.create(
            candidate_name="",
            position="Senior Cloud Infrastructure Architect",
            technology="AWS, Terraform, Kubernetes",
            experience=6.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Fintech Corp",
            assigned_employee=self.team_lead_user,
            recruiter=self.team_lead_user.full_name,
            remarks="[Job Details]\nCTC: 1800000-2500000\nExperience: 6-10 years\n",
            publish_to_career_page=True
        )

        self.associate_job = Application.objects.create(
            candidate_name="",
            position="Cloud Associate Engineer",
            technology="AWS, Terraform",
            experience=2.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Fintech Corp",
            assigned_employee=self.associate_user,
            recruiter=self.associate_user.full_name,
            remarks="[Job Details]\nCTC: 600000-900000\nExperience: 2-4 years\n",
            publish_to_career_page=True
        )

        self.creds_patcher = patch("applications.integrations.foundit.mappers.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "username": "test_username",
            "password": "test_password",
            "corp_id": "188533",
            "recruiter_id": "1220898",
            "channel_id": "1",
            "sub_channel_id": "1",
            "company_name": "People Prime Worldwide",
            "owner_name": "Test Owner",
            "owner_email": "owner@people-prime.com",
            "default_location_id": "6",
            "default_location_name": "Hyderabad / Secunderabad, Telangana",
            "default_industry_id": "140",
            "default_industry_name": "Consumer Software",
            "default_functional_area_id": "1056",
            "default_functional_area_name": "IT",
            "min_salary": "1800000",
            "max_salary": "2500000",
        }
        self.addCleanup(self.creds_patcher.stop)

    def test_omitted_dry_run_defaults_to_true_without_live_api_call(self):
        """Fix 1: Omitted dry_run must default to True and never make a live Foundit API call."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = client.post(f"/api/applications/{self.job.id}/publish-foundit/", {}, format="json")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data.get("success"))
            self.assertTrue(data.get("dry_run"))
            self.assertEqual(data.get("status"), "VALIDATED")
            self.assertIn("Dry run completed without live API calls", data.get("message"))
            mock_post_job.assert_not_called()

    def test_explicit_dry_run_true_performs_dry_run_without_live_api_call(self):
        """Fix 1: dry_run: true must perform a dry run without calling external Foundit API."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = client.post(f"/api/applications/{self.job.id}/publish-foundit/", {"dry_run": True}, format="json")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data.get("success"))
            self.assertTrue(data.get("dry_run"))
            self.assertEqual(data.get("status"), "VALIDATED")
            mock_post_job.assert_not_called()

    def test_dry_run_false_without_confirm_live_rejected_without_external_call(self):
        """Fix 1: dry_run: false without confirm_live: true is rejected with HTTP 400 without calling external API."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = client.post(f"/api/applications/{self.job.id}/publish-foundit/", {"dry_run": False}, format="json")
            self.assertEqual(response.status_code, 400)
            data = response.json()
            self.assertFalse(data.get("success"))
            self.assertIn("confirm_live", data.get("error", "").lower())
            mock_post_job.assert_not_called()

    def test_dry_run_false_with_confirm_live_false_rejected(self):
        """Fix 1: dry_run: false with confirm_live: false is rejected with HTTP 400 without calling external API."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = client.post(
                f"/api/applications/{self.job.id}/publish-foundit/",
                {"dry_run": False, "confirm_live": False},
                format="json"
            )
            self.assertEqual(response.status_code, 400)
            data = response.json()
            self.assertFalse(data.get("success"))
            mock_post_job.assert_not_called()

    def test_dry_run_rejects_non_boolean_values(self):
        """Fix 1: dry_run values like null, 'false', 'true', 0, 1, [], {} must be rejected with HTTP 400."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        invalid_values = [None, "false", "true", 0, 1, [], {}]
        for val in invalid_values:
            with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
                response = client.post(
                    f"/api/applications/{self.job.id}/publish-foundit/",
                    {"dry_run": val},
                    format="json"
                )
                self.assertEqual(
                    response.status_code,
                    400,
                    f"Expected HTTP 400 for dry_run={val!r}, got {response.status_code}"
                )
                self.assertIn("boolean", response.json().get("error", "").lower())
                mock_post_job.assert_not_called()

    def test_malformed_confirm_live_values_rejected(self):
        """Fix 1: Malformed confirm_live values ('true', 1, null, []) must be rejected with HTTP 400."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        malformed_values = ["true", 1, None, 0, "false", [True], {"confirm": True}]
        for val in malformed_values:
            with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
                response = client.post(
                    f"/api/applications/{self.job.id}/publish-foundit/",
                    {"dry_run": False, "confirm_live": val},
                    format="json"
                )
                self.assertEqual(
                    response.status_code,
                    400,
                    f"Expected HTTP 400 for confirm_live={val!r}, got {response.status_code}"
                )
                self.assertIn("confirm_live", response.json().get("error", "").lower())
                mock_post_job.assert_not_called()

    def test_live_publish_authorized_with_strict_booleans(self):
        """Fix 1: dry_run: false and confirm_live: true authorizes live publication to mocked transport."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            mock_post_job.return_value = {"folderId": 778899, "status": "save"}
            response = client.post(
                f"/api/applications/{self.job.id}/publish-foundit/",
                {"dry_run": False, "confirm_live": True},
                format="json"
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data.get("success"))
            self.assertEqual(data.get("status"), "PUBLISHED")
            self.assertEqual(data.get("folder_id"), "778899")
            mock_post_job.assert_called_once()

    def test_duplicate_concurrent_submission_in_flight_blocked(self):
        """Fix 2: Prevent another request from posting the same job while existing posting is PENDING or in-flight."""
        # 1. Existing posting is PENDING in database
        JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            status="PENDING",
            error_message=""
        )

        # 2. Service level verification: publishing must be blocked without remote call
        mock_transport = MockTransport({"folderId": 999999}, status_code=200)
        client = FounditClient(transport=mock_transport)

        posting = FounditJobPostingService.publish_job(self.job, client=client)
        self.assertEqual(posting.status, "PENDING")
        self.assertEqual(mock_transport.post_count, 0)
        self.assertIn("duplicate", posting.error_message.lower())

        # 3. View endpoint level verification: endpoint returns 400 Bad Request
        from rest_framework.test import APIClient
        api_client = APIClient()
        api_client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.client.FounditClient.post_job") as mock_post_job:
            response = api_client.post(
                f"/api/applications/{self.job.id}/publish-foundit/",
                {"dry_run": False, "confirm_live": True},
                format="json"
            )
            self.assertEqual(response.status_code, 400)
            data = response.json()
            self.assertFalse(data.get("success"))
            self.assertEqual(data.get("status"), "PENDING")
            self.assertIn("duplicate", data.get("error", "").lower())
            mock_post_job.assert_not_called()

    def test_unauthorized_roles_receive_http_403_for_validate_and_publish(self):
        """Fix 4: Disallowed operational roles receive HTTP 403 Forbidden for both validate-foundit and publish-foundit."""
        from rest_framework.test import APIClient
        api_client = APIClient()

        # 1. Test ASSOCIATE_ANALYST on a job within their assigned visibility (to verify role restriction beyond queryset)
        api_client.force_authenticate(user=self.associate_user)
        res_val_get = api_client.get(f"/api/applications/{self.associate_job.id}/validate-foundit/")
        self.assertEqual(res_val_get.status_code, 403, "Expected 403 for ASSOCIATE_ANALYST on GET validate-foundit")

        res_val_post = api_client.post(f"/api/applications/{self.associate_job.id}/validate-foundit/")
        self.assertEqual(res_val_post.status_code, 403, "Expected 403 for ASSOCIATE_ANALYST on POST validate-foundit")

        res_pub = api_client.post(f"/api/applications/{self.associate_job.id}/publish-foundit/", {"dry_run": True}, format="json")
        self.assertEqual(res_pub.status_code, 403, "Expected 403 for ASSOCIATE_ANALYST on POST publish-foundit")

        # 2. Test REPORTING_TEAM which has global queryset visibility but no operational posting role
        api_client.force_authenticate(user=self.reporting_user)
        res_val_get2 = api_client.get(f"/api/applications/{self.job.id}/validate-foundit/")
        self.assertEqual(res_val_get2.status_code, 403, "Expected 403 for REPORTING_TEAM on GET validate-foundit")

        res_pub2 = api_client.post(f"/api/applications/{self.job.id}/publish-foundit/", {"dry_run": True}, format="json")
        self.assertEqual(res_pub2.status_code, 403, "Expected 403 for REPORTING_TEAM on POST publish-foundit")

        # 3. Authorized operational roles: TEAM_LEAD and ADMIN
        for user in [self.team_lead_user, self.admin_user]:
            api_client.force_authenticate(user=user)
            res_val = api_client.get(f"/api/applications/{self.job.id}/validate-foundit/")
            self.assertEqual(res_val.status_code, 200, f"Expected 200 for {user.role} on GET validate-foundit")

            res_pub = api_client.post(f"/api/applications/{self.job.id}/publish-foundit/", {"dry_run": True}, format="json")
            self.assertEqual(res_pub.status_code, 200, f"Expected 200 for {user.role} on POST publish-foundit")

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


from django.test import TestCase, override_settings
from django.core.cache import cache
import applications.views as app_views
from applications.views import (
    get_hierarchy_stats_version,
    invalidate_hierarchy_stats_cache,
    get_cached_hierarchy_stats,
    set_cached_hierarchy_stats,
    _check_redis_alive,
    HIERARCHY_STATS_VERSION_CACHE_KEY,
)
from applications.models import Application, Note
from users.models import User, Role
import time
import os


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'hierarchy-stats-test-cache',
        }
    }
)
class HierarchyStatsCacheRegressionTests(TestCase):
    """
    Regression test suite for Redis caching and memory optimization in hierarchy statistics.
    Ensures Redis is the sole shared cache, eliminating unbounded in-process retention,
    while gracefully handling Redis outages and verifying endpoint parity.
    """

    def setUp(self):
        cache.clear()
        app_views._REDIS_AVAILABLE = None
        app_views._LAST_REDIS_CHECK = 0
        self.factory = RequestFactory()
        self.test_user = User.objects.create(
            email='recruiter_test@example.com',
            full_name='Recruiter Test',
            role=Role.ADMIN,
            is_active=True
        )

    def tearDown(self):
        cache.clear()
        app_views._REDIS_AVAILABLE = None
        app_views._LAST_REDIS_CHECK = 0

    def test_redis_cache_hit_returns_expected_data(self):
        """Redis cache hit must return the exact cached response object."""
        test_key = "hierarchy_stats_test_hit"
        test_payload = {
            'user_metrics': {'recruiter_test@example.com': {'jobsCount': 3, 'submissions': 10}},
            'start_date': '2026-01-01',
            'end_date': '2026-01-31'
        }
        set_cached_hierarchy_stats(test_key, test_payload, timeout=900)
        cached_result = get_cached_hierarchy_stats(test_key)
        self.assertEqual(cached_result, test_payload)

    def test_redis_cache_miss_returns_no_cached_response(self):
        """A cache miss must return None and never raise an exception."""
        result = get_cached_hierarchy_stats("non_existent_hierarchy_cache_key_9999")
        self.assertIsNone(result)

    def test_successful_cache_write_does_not_populate_in_process_fallback(self):
        """
        Successful cache writes must not store responses in an in-process dictionary,
        preventing Gunicorn worker memory bloat.
        """
        test_key = "hierarchy_stats_no_process_dict"
        test_payload = {'large_data_blob': 'x' * 10000}
        set_cached_hierarchy_stats(test_key, test_payload, timeout=900)

        # Verify _HIERARCHY_STATS_FALLBACK_CACHE is removed or empty
        fallback = getattr(app_views, '_HIERARCHY_STATS_FALLBACK_CACHE', None)
        self.assertTrue(
            fallback is None or len(fallback) == 0,
            "_HIERARCHY_STATS_FALLBACK_CACHE must be removed or remain unpopulated"
        )

    def test_cache_expiration_works(self):
        """Cached data must expire according to its TTL and return None thereafter."""
        test_key = "hierarchy_stats_expiring_key"
        test_payload = {'status': 'temporary'}
        set_cached_hierarchy_stats(test_key, test_payload, timeout=1)

        # Check it is present initially
        self.assertEqual(get_cached_hierarchy_stats(test_key), test_payload)

        # Simulate expiration by deleting from cache
        cache.delete(test_key)
        self.assertIsNone(get_cached_hierarchy_stats(test_key))

    def test_cache_invalidation_causes_subsequent_requests_to_use_new_version(self):
        """
        Invalidation must increment the cache version, making previous versioned keys
        inaccessible to subsequent requests.
        """
        v1 = get_hierarchy_stats_version()
        k1 = f"hierarchy_stats_v{v1}_all_all"
        set_cached_hierarchy_stats(k1, {'version': v1, 'count': 5}, timeout=900)
        self.assertIsNotNone(get_cached_hierarchy_stats(k1))

        # Invalidate cache
        invalidate_hierarchy_stats_cache()

        v2 = get_hierarchy_stats_version()
        self.assertGreater(v2, v1, "Cache version must increment upon invalidation")

        k2 = f"hierarchy_stats_v{v2}_all_all"
        # The key for v2 has not been populated yet, so it must return None
        self.assertIsNone(get_cached_hierarchy_stats(k2))

    def test_redis_connection_failure_does_not_return_stale_cached_data(self):
        """
        When Redis encounters a connection failure, get_cached_hierarchy_stats must return None
        rather than returning stale entries from an in-process fallback.
        """
        test_key = "hierarchy_stats_failure_test"
        # Simulate Redis failure by forcing _check_redis_alive to return False
        with patch.object(app_views, '_check_redis_alive', return_value=False):
            result = get_cached_hierarchy_stats(test_key)
            self.assertIsNone(result)

    def test_redis_connection_failure_does_not_cause_unhandled_exceptions(self):
        """
        Cache helper functions must gracefully catch Redis exceptions and not crash callers.
        """
        app_views._REDIS_AVAILABLE = True
        with patch('django.core.cache.cache.get', side_effect=Exception("Redis connection refused")):
            with patch('django.core.cache.cache.set', side_effect=Exception("Redis connection refused")):
                with patch('django.core.cache.cache.incr', side_effect=Exception("Redis connection refused")):
                    app_views._REDIS_AVAILABLE = None
                    app_views._LAST_REDIS_CHECK = 0

                    # 1. _check_redis_alive handles exception
                    self.assertFalse(_check_redis_alive())

                    # 2. get_hierarchy_stats_version returns fallback 1
                    ver = get_hierarchy_stats_version()
                    self.assertEqual(ver, 1)

                    # 3. get_cached_hierarchy_stats returns None
                    cached = get_cached_hierarchy_stats("any_key")
                    self.assertIsNone(cached)

                    # 4. set_cached_hierarchy_stats completes without error
                    try:
                        set_cached_hierarchy_stats("any_key", {"data": 123}, timeout=900)
                    except Exception as e:
                        self.fail(f"set_cached_hierarchy_stats raised unexpected exception: {e}")

                    # 5. invalidate_hierarchy_stats_cache completes without error
                    try:
                        invalidate_hierarchy_stats_cache()
                    except Exception as e:
                        self.fail(f"invalidate_hierarchy_stats_cache raised unexpected exception: {e}")

    def test_atomic_version_initialization_does_not_overwrite_concurrent_increment(self):
        """
        Atomic initialization with cache.add (SETNX) ensures that if another worker
        initializes or increments the version key concurrently, it is not overwritten back to 1.
        """
        cache.clear()
        app_views._REDIS_AVAILABLE = True

        def mock_add(key, val, timeout=None):
            # Another worker already set the key to 5
            cache.set(key, 5, timeout=None)
            # Current worker's add fails because key already exists
            return False

        with patch.object(cache, 'add', side_effect=mock_add):
            ver = get_hierarchy_stats_version()
            # Must return the existing version 5, not overwrite it to 1
            self.assertEqual(ver, 5)

    def test_cache_recovery_resumes_caching_after_outage(self):
        """
        During a Redis outage, requests compute without caching.
        Once Redis recovers, caching cleanly resumes.
        """
        # Outage phase: _check_redis_alive returns False
        app_views._REDIS_AVAILABLE = False
        app_views._LAST_REDIS_CHECK = time.time()
        with patch.object(app_views, '_check_redis_alive', return_value=False):
            set_cached_hierarchy_stats("recovery_key", {"val": 1}, timeout=900)
            self.assertIsNone(get_cached_hierarchy_stats("recovery_key"))

        # Recovery phase: Redis back online
        app_views._REDIS_AVAILABLE = True
        set_cached_hierarchy_stats("recovery_key", {"val": 1}, timeout=900)
        self.assertEqual(get_cached_hierarchy_stats("recovery_key"), {"val": 1})

    def test_concurrent_invalidation_signals_increment_atomically(self):
        """Multiple sequential or concurrent invalidation calls must monotonically increment version."""
        v_start = get_hierarchy_stats_version()
        for i in range(5):
            invalidate_hierarchy_stats_cache()
        v_end = get_hierarchy_stats_version()
        self.assertEqual(v_end, v_start + 5)

    def test_cache_set_failure_without_exception_handled_cleanly(self):
        """When cache.set returns False (e.g. Redis out of memory), set_cached_hierarchy_stats does not crash."""
        with patch.object(cache, 'set', return_value=False):
            try:
                set_cached_hierarchy_stats("key", {"data": 1}, timeout=900)
            except Exception as e:
                self.fail(f"set_cached_hierarchy_stats raised unexpectedly: {e}")

    def test_application_and_note_saves_do_not_break_during_cache_outage(self):
        """Application saves and Note saves must never fail even if Redis is completely dead."""
        app_views._REDIS_AVAILABLE = False
        with patch('django.core.cache.cache.get', side_effect=Exception("Redis dead")):
            with patch('django.core.cache.cache.set', side_effect=Exception("Redis dead")):
                with patch('django.core.cache.cache.incr', side_effect=Exception("Redis dead")):
                    # Application creation triggers post_save signal
                    app = Application.objects.create(
                        candidate_name="Crashproof Candidate",
                        candidate_email="crashproof@example.com",
                        position="Backend Developer",
                        technology="Python",
                        experience=4.0,
                        client_name="Acme Systems",
                        status="New",
                        assigned_employee=self.test_user
                    )
                    self.assertIsNotNone(app.id)

                    # Note creation triggers post_save signal
                    note = Note.objects.create(
                        application=app,
                        author=self.test_user,
                        content="Status updated to Submitted"
                    )
                    self.assertIsNotNone(note.id)

    def test_model_signals_trigger_hierarchy_cache_invalidation(self):
        """
        Saving or deleting Application, Note, or User must trigger cache version invalidation.
        """
        initial_ver = get_hierarchy_stats_version()

        # Create an Application instance
        app = Application.objects.create(
            candidate_name="Candidate Invalidation Test",
            candidate_email="cand_inv@example.com",
            position="Software Engineer",
            technology="Python",
            experience=5.0,
            client_name="Test Client",
            status="New",
            assigned_employee=self.test_user
        )

        # Post-save signal on Application should have incremented the version
        ver_after_app = get_hierarchy_stats_version()
        self.assertGreater(ver_after_app, initial_ver)

        # Create a Note instance
        note = Note.objects.create(
            application=app,
            author=self.test_user,
            content="Status updated to Submitted"
        )

        ver_after_note = get_hierarchy_stats_version()
        self.assertGreater(ver_after_note, ver_after_app)

    def test_hierarchy_stats_endpoint_behavior_and_parity_under_redis_failure(self):
        """
        hierarchy_stats endpoint must compute valid responses whether Redis is operational
        or offline, and the response structure and calculations must remain identical.
        """
        # Create test fixture data
        app = Application.objects.create(
            candidate_name="Jane Doe",
            candidate_email="jane@example.com",
            position="DevOps Engineer",
            technology="DevOps",
            experience=4.0,
            client_name="Cloud Corp",
            status="New",
            remarks="Job Code: PPW-5001",
            recruiter="recruiter_test@example.com",
            assigned_employee=self.test_user
        )

        view = ApplicationViewSet()
        view.action = 'hierarchy_stats'
        drf_req = Request(self.factory.get('/api/applications/hierarchy-stats/'))
        drf_req.user = self.test_user
        view.request = drf_req

        # 1. With Redis operational (cache miss followed by cache write)
        resp1 = view.hierarchy_stats(drf_req)
        self.assertEqual(resp1.status_code, 200)
        self.assertIn('user_metrics', resp1.data)
        self.assertIn('start_date', resp1.data)
        self.assertIn('end_date', resp1.data)

        # 2. Second request should hit cache
        resp2 = view.hierarchy_stats(drf_req)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp1.data, resp2.data)

        # 3. With Redis offline, endpoint must compute response without crashing
        app_views._REDIS_AVAILABLE = False
        app_views._LAST_REDIS_CHECK = time.time()
        with patch.object(app_views, '_check_redis_alive', return_value=False):
            resp3 = view.hierarchy_stats(drf_req)
            self.assertEqual(resp3.status_code, 200)
            self.assertEqual(resp3.data, resp1.data)

    def test_hierarchy_drilldown_endpoint_behavior_and_parity_under_redis_failure(self):
        """
        hierarchy_drilldown endpoint must compute valid responses whether Redis is operational
        or offline, preserving full response parity.
        """
        app = Application.objects.create(
            candidate_name="John Smith",
            candidate_email="john@example.com",
            position="Python Developer",
            technology="Python",
            experience=3.5,
            client_name="Prime Tech",
            status="New",
            remarks="Job Code: PPW-6001",
            recruiter="recruiter_test@example.com",
            assigned_employee=self.test_user
        )

        view = ApplicationViewSet()
        view.action = 'hierarchy_drilldown'
        drf_req = Request(self.factory.get('/api/applications/hierarchy-drilldown/?metric_type=JOBS'))
        drf_req.user = self.test_user
        view.request = drf_req

        # 1. Operational Redis: miss + set
        resp1 = view.hierarchy_drilldown(drf_req)
        self.assertEqual(resp1.status_code, 200)
        self.assertIn('results', resp1.data)
        self.assertIn('count', resp1.data)

        # 2. Operational Redis: hit
        resp2 = view.hierarchy_drilldown(drf_req)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp1.data['count'], resp2.data['count'])

        # 3. Redis offline: computes directly without error
        with patch.object(app_views, '_check_redis_alive', return_value=False):
            resp3 = view.hierarchy_drilldown(drf_req)
            self.assertEqual(resp3.status_code, 200)
            self.assertEqual(resp3.data['count'], resp1.data['count'])


import datetime
from django.utils import timezone

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditPhase4AApplicationRetrievalTests(TestCase):
    def setUp(self):
        from users.models import User, Role
        self.admin_user = User.objects.create(
            email='retrieval_admin@example.com',
            full_name='Retrieval Admin',
            role=Role.ADMIN,
            is_active=True
        )
        self.team_lead_user = User.objects.create(
            email='retrieval_tl@example.com',
            full_name='Retrieval Team Lead',
            role=Role.TEAM_LEAD,
            is_active=True
        )
        self.associate_user = User.objects.create(
            email='retrieval_assoc@example.com',
            full_name='Retrieval Associate',
            role=Role.ASSOCIATE_ANALYST,
            is_active=True
        )
        self.job = Application.objects.create(
            candidate_name="",
            position="Senior Java Full Stack Engineer",
            technology="Java, Spring Boot, React",
            experience=5.0,
            city="Hyderabad",
            state="Telangana",
            country="India",
            client_name="Global Systems Inc",
            remarks="High priority job.",
            assigned_employee=self.team_lead_user
        )
        self.posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="987654321",
            status="PUBLISHED"
        )
        # Mock credentials
        self.creds_patcher = patch("applications.integrations.foundit.constants.get_foundit_credentials")
        self.mock_creds = self.creds_patcher.start()
        self.mock_creds.return_value = {
            "api_key": "mock_api_key",
            "corp_id": "12345",
            "login_id": "8765432",
            "username": "testuser",
            "password": "testpassword",
            "channel_id": "1",
            "sub_channel_id": "1",
            "webhook_secret": "testsecret"
        }
        self.addCleanup(self.creds_patcher.stop)

        # Mock AI scoring task
        self.score_patcher = patch("applications.ai.tasks.score_applicant_resume_task.delay")
        self.mock_score = self.score_patcher.start()
        self.addCleanup(self.score_patcher.stop)

    def test_official_nested_response_envelope_unwrapping(self):
        """Test unwrapping of official Foundit {success: true, data: {applications: [...]}} structure."""
        nested_payload = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "job_title": "Senior Java Full Stack Engineer",
                "total_job_applications": 1,
                "total_fetched_applications": 1,
                "page_number": 1,
                "applications": [
                    {
                        "application_id": "FND-APP-001",
                        "candidate_name": "Ravi Kumar",
                        "current_folder_stage": "Applicant",
                        "application_date": "2025-08-11T16:33:54Z",
                        "resume_file_download_url": "https://recruiter.foundit.in/download/resume_ravi.pdf",
                        "profile_details": {
                            "email": [{"id": "ravi.kumar@example.com", "is_verified": True}],
                            "mobile_details": [{"country_code": "91", "number": "9876543210", "verified": True}],
                            "skills": [{"text": "Java"}, {"text": "Spring Boot"}],
                            "highest_education": {"degree": "Bachelor of Technology", "college": "JNTU"},
                            "profile_id": 115478367
                        }
                    }
                ]
            },
            "error": None
        }
        client = FounditClient(transport=MockTransport(nested_payload))
        summary = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)

        self.assertEqual(summary["total_job_applications"], 1)
        self.assertEqual(summary["new_ingested"], 1)
        self.assertEqual(summary["duplicates_skipped"], 0)
        self.assertEqual(summary["failed_errors"], 0)

        applicant = CareerPortalApplicant.objects.get(foundit_application_id="FND-APP-001")
        self.assertEqual(applicant.first_name, "Ravi")
        self.assertEqual(applicant.last_name, "Kumar")
        self.assertEqual(applicant.email, "ravi.kumar@example.com")
        self.assertEqual(applicant.mobile_number, "+919876543210")
        self.assertIn("Java", applicant.primary_skills)
        self.assertEqual(applicant.qualification, "Bachelor of Technology")
        self.assertEqual(applicant.foundit_candidate_id, "115478367")
        self.assertEqual(applicant.source, "Foundit")
        self.assertIsNotNone(applicant.raw_profile_data)
        self.assertEqual(applicant.raw_profile_data.get("application_id"), "FND-APP-001")

    def test_mapper_handles_complex_arrays_and_parsed_experience(self):
        """Test FounditCandidateMapper handles email arrays, phone arrays, it_skills, and resume_parsed_data."""
        app_dict = {
            "application_id": "FND-APP-002",
            "candidate_name": "Ananya Sharma",
            "folder_id": "987654321",
            "resume_file_download_url": "https://foundit.in/resumes/ananya.pdf",
            "profile_details": {
                "personal_details": [{"first_name": "Ananya", "last_name": "Sharma"}],
                "email": [
                    {"id": "unverified@example.com", "is_verified": False},
                    {"id": "ananya.verified@example.com", "is_verified": True}
                ],
                "mobile_details": [
                    {"country_code": "91", "number": "9123456789", "verified": True}
                ],
                "it_skills": [{"text": "Python"}, {"text": "FastAPI"}],
                "skills": [{"text": "PostgreSQL"}],
                "top_qualification_name": "M.Tech Computer Science",
                "resume_parsed_data": {
                    "experience": 4.5,
                    "additional_parsed_data": {
                        "current_employment_designation": "Backend Engineer"
                    }
                },
                "current_location": [{"text": "Bengaluru, Karnataka"}],
                "profile_id": 99887766
            }
        }
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])

        self.assertEqual(applicant.first_name, "Ananya")
        self.assertEqual(applicant.last_name, "Sharma")
        # Verified email should be chosen
        self.assertEqual(applicant.email, "ananya.verified@example.com")
        self.assertEqual(applicant.mobile_number, "+919123456789")
        self.assertIn("Python", applicant.primary_skills)
        self.assertIn("FastAPI", applicant.primary_skills)
        self.assertIn("PostgreSQL", applicant.primary_skills)
        self.assertEqual(applicant.qualification, "M.Tech Computer Science")
        self.assertEqual(applicant.years_of_experience, 4.5)
        self.assertEqual(applicant.current_company, "Backend Engineer")
        self.assertEqual(applicant.city, "Bengaluru")
        self.assertEqual(applicant.state, "Karnataka")
        self.assertEqual(applicant.foundit_candidate_id, "99887766")
        self.assertEqual(applicant.foundit_application_id, "FND-APP-002")

    def test_database_level_duplicate_prevention_on_foundit_application_id(self):
        """Test database UniqueConstraint prevents duplicate Foundit application insertion safely."""
        app_dict = {
            "application_id": "FND-DUP-CONSTRAINT",
            "candidate_name": "Duplicate Tester",
            "folder_id": "987654321",
            "profile_details": {
                "email": [{"id": "dup@example.com", "is_verified": True}]
            }
        }
        res1 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res1["success"])
        self.assertFalse(res1.get("duplicate", False))

        # Second ingestion should cleanly report duplicate: True without database IntegrityError crash
        res2 = FounditCandidateIngestionService.ingest_candidate(app_dict)
        self.assertTrue(res2["success"])
        self.assertTrue(res2.get("duplicate"))
        self.assertEqual(res1["applicant_id"], res2["applicant_id"])
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="FND-DUP-CONSTRAINT").count(), 1)

    def test_empty_and_malformed_response_handling(self):
        """Test handling of empty applications array and malformed API response."""
        empty_response = {
            "success": True,
            "data": {
                "total_job_applications": 0,
                "applications": []
            }
        }
        client = FounditClient(transport=MockTransport(empty_response))
        summary = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary["total_fetched"], 0)
        self.assertEqual(summary["pages_fetched"], 1)

        # Malformed non-dict response handled safely
        client_malformed = FounditClient(transport=MockTransport("non-json-string"))
        summary2 = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client_malformed)
        self.assertEqual(summary2["new_ingested"], 0)

    def test_checkpoint_advancement_only_on_clean_persistence(self):
        """Test posting.last_synced_at is advanced on clean sync, and preserved if errors occur."""
        self.assertIsNone(self.posting.last_synced_at)

        clean_resp = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": [
                    {
                        "application_id": "FND-CLEAN-01",
                        "candidate_name": "Clean Tester",
                        "folder_id": "987654321"
                    }
                ]
            }
        }
        client = FounditClient(transport=MockTransport(clean_resp))
        FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)

        self.posting.refresh_from_db()
        self.assertIsNotNone(self.posting.last_synced_at)
        initial_synced_at = self.posting.last_synced_at

        # Now simulate a sync that fails with an unmatched folder or API error
        error_resp = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": [
                    {
                        "application_id": "FND-ERR-01",
                        "candidate_name": "Error Tester",
                        "folder_id": "UNKNOWN_UNMATCHED_FOLDER"
                    }
                ]
            }
        }
        client_err = FounditClient(transport=MockTransport(error_resp))
        summary_err = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client_err)
        self.assertGreater(summary_err["unmatched_errors"], 0)

        # Checkpoint must NOT advance past unmatched errors
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_synced_at)

    def test_overlapping_sync_lock_prevents_duplicate_runs(self):
        """Test cache lock prevents overlapping sync_all_published_jobs runs."""
        from django.core.cache import cache
        cache.set("foundit_sync_all_jobs_lock", "running", timeout=900)

        res = FounditApplicationSyncService.sync_all_published_jobs()
        self.assertTrue(res.get("skipped"))
        self.assertEqual(res.get("total_jobs_scanned"), 0)

        cache.delete("foundit_sync_all_jobs_lock")

    def test_celery_task_registration_and_beat_schedule(self):
        """Test that Foundit Celery tasks are discovered and periodic sync is in CELERY_BEAT_SCHEDULE."""
        import applications.tasks  # triggers autodiscovery
        from ats_backend.celery import app as celery_app
        from django.conf import settings

        # Verify task is discoverable in celery
        registered_tasks = celery_app.tasks.keys()
        self.assertTrue(
            any("sync_all_foundit_jobs_task" in t for t in registered_tasks),
            "sync_all_foundit_jobs_task should be registered with Celery app"
        )
        self.assertTrue(
            any("sync_foundit_applications_task" in t for t in registered_tasks),
            "sync_foundit_applications_task should be registered with Celery app"
        )

        # Verify Celery Beat schedule
        beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
        self.assertIn("sync-all-foundit-jobs-periodic", beat_schedule)
        self.assertEqual(
            beat_schedule["sync-all-foundit-jobs-periodic"]["task"],
            "applications.integrations.foundit.tasks.sync_all_foundit_jobs_task"
        )

    def test_on_demand_sync_endpoint_permissions_and_validation(self):
        """Test /api/applications/<id>/sync-foundit/ action permissions and behavior."""
        from rest_framework.test import APIClient
        client = APIClient()

        # 0. Live sync disabled by default: endpoint rejects safely with 400 and LIVE_SYNC_DISABLED
        client.force_authenticate(user=self.admin_user)
        with patch("applications.integrations.foundit.tasks.sync_foundit_applications_task.delay") as mock_delay:
            res_disabled = client.post(f"/api/applications/{self.job.id}/sync-foundit/")
            self.assertEqual(res_disabled.status_code, 400)
            self.assertFalse(res_disabled.data.get("success"))
            self.assertEqual(res_disabled.data.get("code"), "LIVE_SYNC_DISABLED")
            mock_delay.assert_not_called()

        # 1. When live sync is enabled, Admin user can successfully queue sync
        with patch.dict("os.environ", {"FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true"}):
            with patch("applications.integrations.foundit.tasks.sync_foundit_applications_task.delay") as mock_delay:
                mock_delay.return_value = MagicMock(id="celery-task-12345")
                res = client.post(f"/api/applications/{self.job.id}/sync-foundit/")
                self.assertEqual(res.status_code, 202)
                self.assertTrue(res.data.get("success"))
                self.assertEqual(res.data.get("status"), "QUEUED")
                self.assertEqual(res.data.get("folder_id"), "987654321")
                mock_delay.assert_called_once_with("987654321")

            # 2. Team Lead can also call it when live sync is enabled
            client.force_authenticate(user=self.team_lead_user)
            with patch("applications.integrations.foundit.tasks.sync_foundit_applications_task.delay") as mock_delay:
                mock_delay.return_value = MagicMock(id="celery-task-67890")
                res2 = client.post(f"/api/applications/{self.job.id}/sync-foundit/")
                self.assertEqual(res2.status_code, 202)

            # 3. Associate Analyst receives 403 Forbidden even when live sync is enabled
            client.force_authenticate(user=self.associate_user)
            res3 = client.post(f"/api/applications/{self.job.id}/sync-foundit/")
            self.assertEqual(res3.status_code, 403)

            # 4. Job without published Foundit posting receives 400 Bad Request
            client.force_authenticate(user=self.admin_user)
            unpub_job = Application.objects.create(
                candidate_name="",
                position="Unpublished Job",
                technology="Go",
                experience=2.0,
                city="Hyderabad",
                state="Telangana",
                client_name="Test Client"
            )
            res4 = client.post(f"/api/applications/{unpub_job.id}/sync-foundit/")
            self.assertEqual(res4.status_code, 400)
            self.assertIn("does not have an active published Foundit posting", res4.data.get("error"))

    def test_serializer_exposes_foundit_identifiers(self):
        """Test CareerPortalApplicantSerializer includes foundit_application_id and foundit_candidate_id."""
        from applications.serializers import CareerPortalApplicantSerializer
        applicant = CareerPortalApplicant.objects.create(
            job=self.job,
            first_name="Meera",
            last_name="Nair",
            email="meera@example.com",
            mobile_number="+919876500000",
            qualification="B.Tech",
            years_of_experience=3.0,
            expected_pay=800000.0,
            primary_skills="Java",
            current_ctc=600000.0,
            current_company="Acme Corp",
            state="Telangana",
            city="Hyderabad",
            source="Foundit",
            foundit_application_id="APP-SER-001",
            foundit_candidate_id="CAND-SER-999"
        )
        serializer = CareerPortalApplicantSerializer(applicant)
        data = serializer.data
        self.assertIn("foundit_application_id", data)
        self.assertEqual(data["foundit_application_id"], "APP-SER-001")
        self.assertIn("foundit_candidate_id", data)
        self.assertEqual(data["foundit_candidate_id"], "CAND-SER-999")

    @patch("requests.get")
    def test_client_http_401_token_refresh_retry(self, mock_get):
        """Test FounditClient automatically refreshes session token and retries on HTTP 401."""
        resp_401 = MagicMock()
        resp_401.status_code = 401
        resp_401.headers = {}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.headers = {"X-RateLimit-Remaining": "95"}
        resp_200.json.return_value = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 0,
                "applications": []
            }
        }

        # First call returns 401, second call returns 200
        mock_get.side_effect = [resp_401, resp_200]

        client = FounditClient()
        client.live_applications_enabled = True  # Temporarily authorize for unit test
        with patch.object(client, "generate_session_token", return_value="new_mock_token") as mock_token_gen:
            res = client.get_applications("987654321")
            self.assertTrue(res.get("success"))
            # Verified token generation force refresh was requested
            mock_token_gen.assert_called_with(force_refresh=True)
            self.assertEqual(mock_get.call_count, 2)

    def test_checkpoint_uses_sync_started_at_protecting_in_flight_applications(self):
        """Test checkpoint is recorded at sync start time so applications arriving during sync are not missed."""
        sync_start_ref = timezone.now()
        payload = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": [
                    {
                        "application_id": "APP-INFLIGHT-1",
                        "candidate_name": "Inflight Candidate",
                        "folder_id": "987654321"
                    }
                ]
            }
        }
        client = FounditClient(transport=MockTransport(payload))
        summary = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary["new_ingested"], 1)

        self.posting.refresh_from_db()
        self.assertIsNotNone(self.posting.last_synced_at)
        # Checkpoint timestamp must be >= test start time and <= current time
        self.assertGreaterEqual(self.posting.last_synced_at, sync_start_ref)
        self.assertLessEqual(self.posting.last_synced_at, timezone.now())

    def test_duplicate_results_in_overlapping_synchronization_window(self):
        """Test overlapping synchronization window deduplicates existing applications while ingesting new ones."""
        # Pre-ingest applicant 1
        initial_app = {
            "application_id": "APP-OVERLAP-1",
            "candidate_name": "Existing Applicant",
            "folder_id": "987654321"
        }
        res = FounditCandidateIngestionService.ingest_candidate(initial_app)
        self.assertTrue(res["success"])
        self.assertFalse(res.get("duplicate"))

        # Set checkpoint to 10 minutes ago
        past_checkpoint = timezone.now() - datetime.timedelta(minutes=10)
        self.posting.last_synced_at = past_checkpoint
        self.posting.save(update_fields=["last_synced_at"])

        # Overlapping sync returns applicant 1 again plus applicant 2
        overlap_payload = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 2,
                "applications": [
                    {
                        "application_id": "APP-OVERLAP-1",
                        "candidate_name": "Existing Applicant",
                        "folder_id": "987654321"
                    },
                    {
                        "application_id": "APP-OVERLAP-2",
                        "candidate_name": "New Applicant",
                        "folder_id": "987654321"
                    }
                ]
            }
        }
        client = FounditClient(transport=MockTransport(overlap_payload))
        results = FounditApplicationSyncService.sync_all_published_jobs(client=client)

        self.assertEqual(results["total_new_ingested"], 1)
        self.assertEqual(results["total_duplicates_skipped"], 1)
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="APP-OVERLAP-1").count(), 1)
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="APP-OVERLAP-2").count(), 1)

        self.posting.refresh_from_db()
        self.assertGreater(self.posting.last_synced_at, past_checkpoint)

    def test_unmatched_folder_id_retry_and_subsequent_quarantine(self):
        """Test unmatched folder errors hold checkpoint for 2 retries, then quarantine on 3rd attempt to prevent permanent stall."""
        from django.core.cache import cache
        cache.delete("foundit_folder_consecutive_errors_987654321")

        unmatched_payload = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": [
                    {
                        "application_id": "APP-CORRUPT-1",
                        "candidate_name": "Corrupt Candidate",
                        "folder_id": "NON_EXISTENT_FOLDER"
                    }
                ]
            }
        }
        client = FounditClient(transport=MockTransport(unmatched_payload))

        # Attempt 1: Checkpoint held, no quarantine
        summary1 = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary1["unmatched_errors"], 1)
        self.assertFalse(summary1["quarantined"])
        self.posting.refresh_from_db()
        self.assertIsNone(self.posting.last_synced_at)

        # Attempt 2: Checkpoint held, no quarantine
        summary2 = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary2["unmatched_errors"], 1)
        self.assertFalse(summary2["quarantined"])
        self.posting.refresh_from_db()
        self.assertIsNone(self.posting.last_synced_at)

        # Attempt 3: Max retry threshold reached -> Quarantined and checkpoint advanced to unblock future syncs
        summary3 = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary3["unmatched_errors"], 1)
        self.assertTrue(summary3["quarantined"])
        self.posting.refresh_from_db()
        self.assertIsNotNone(self.posting.last_synced_at)
        self.assertIn("Quarantined", self.posting.error_message)

    def test_malformed_candidate_payload_handled_safely(self):
        """Test malformed candidate payloads return code MALFORMED_CANDIDATE_PAYLOAD without unhandled exceptions."""
        # Non-dict payload
        res1 = FounditCandidateIngestionService.ingest_candidate("not_a_dictionary")
        self.assertFalse(res1["success"])
        self.assertEqual(res1["code"], "MALFORMED_CANDIDATE_PAYLOAD")

        # In sync_applications_for_folder, a non-dict application entry increments failed_errors
        malformed_envelope = {
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": ["invalid_string_item"]
            }
        }
        client = FounditClient(transport=MockTransport(malformed_envelope))
        summary = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client)
        self.assertEqual(summary["failed_errors"], 1)

    def test_failed_database_write_returns_db_integrity_conflict(self):
        """Test database integrity conflict when no matching applicant can be found returns DB_INTEGRITY_CONFLICT."""
        from django.db import IntegrityError
        app_dict = {
            "application_id": "APP-FAIL-DB",
            "candidate_name": "Failure Case",
            "folder_id": "987654321"
        }
        with patch("applications.models.CareerPortalApplicant.objects.create", side_effect=IntegrityError("Foreign key violation")):
            res = FounditCandidateIngestionService.ingest_candidate(app_dict)
            self.assertFalse(res["success"])
            self.assertEqual(res["code"], "DB_INTEGRITY_CONFLICT")

    def test_transient_failure_recovery_on_following_sync_run(self):
        """Test transient failure recovery on the following synchronization run."""
        from django.core.cache import cache
        cache.delete("foundit_folder_consecutive_errors_987654321")

        # Run 1: Network error occurred
        client_fail = FounditClient(transport=MockTransport(None, exception=FounditAPIError("Transient network timeout", status_code=500)))
        summary_fail = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client_fail)
        self.assertIsNotNone(summary_fail.get("error"))
        self.posting.refresh_from_db()
        self.assertIsNone(self.posting.last_synced_at)

        # Run 2: Next run recovers successfully
        client_success = FounditClient(transport=MockTransport({
            "success": True,
            "data": {
                "folder_id": "987654321",
                "total_job_applications": 1,
                "applications": [{"application_id": "APP-REC-1", "candidate_name": "Recovered", "folder_id": "987654321"}]
            }
        }))
        summary_ok = FounditApplicationSyncService.sync_applications_for_folder("987654321", client=client_success)
        self.assertEqual(summary_ok["new_ingested"], 1)
        self.posting.refresh_from_db()
        self.assertIsNotNone(self.posting.last_synced_at)
        self.assertEqual(self.posting.error_message, "")

    def test_utc_timestamp_formatting_helpers(self):
        """Test explicit UTC timestamp conversion for naive and timezone-aware datetimes."""
        # 1. Aware datetime with offset (+05:30 IST)
        ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
        dt_ist = datetime.datetime(2026, 4, 15, 12, 30, 0, tzinfo=ist)
        formatted_ist = FounditApplicationSyncService.format_applications_since(dt_ist)
        # 12:30 IST = 07:00 UTC
        self.assertEqual(formatted_ist, "2026-04-15T07:00:00Z")

        # 2. Naive datetime
        dt_naive = datetime.datetime(2026, 4, 15, 10, 0, 0)
        formatted_naive = FounditApplicationSyncService.format_applications_since(dt_naive)
        self.assertEqual(formatted_naive, "2026-04-15T10:00:00Z")

        # 3. String pass-through
        self.assertEqual(FounditApplicationSyncService.format_applications_since(" 2026-04-15T00:00:00Z "), "2026-04-15T00:00:00Z")
        self.assertIsNone(FounditApplicationSyncService.format_applications_since(None))

    def test_redis_lock_ownership_expired_worker_cannot_delete_new_lock(self):
        """Test worker whose lock expired cannot delete another worker's freshly acquired lock."""
        from django.core.cache import cache
        lock_key = "foundit_sync_all_jobs_lock"

        # Worker 1 acquires lock
        token_worker_1 = "worker-1-uuid"
        token_worker_2 = "worker-2-uuid"

        cache.set(lock_key, token_worker_1, timeout=900)
        self.assertEqual(cache.get(lock_key), token_worker_1)

        # Worker 1's lock expires and Worker 2 acquires the lock
        cache.set(lock_key, token_worker_2, timeout=900)

        # Worker 1 finishes and attempts to release the lock using its expired token
        released = FounditApplicationSyncService._release_lock(lock_key, token_worker_1)
        self.assertFalse(released)

        # Worker 2's lock is still intact!
        self.assertEqual(cache.get(lock_key), token_worker_2)

        # Worker 2 successfully releases its lock
        released_w2 = FounditApplicationSyncService._release_lock(lock_key, token_worker_2)
        self.assertTrue(released_w2)
        self.assertIsNone(cache.get(lock_key))

    def test_concurrent_duplicate_insertion_leaves_outer_transaction_usable(self):
        """Test savepoint isolation: duplicate IntegrityError inside outer transaction leaves connection healthy."""
        from django.db import transaction

        app_dict = {
            "application_id": "APP-TX-TEST-1",
            "candidate_name": "Tx Tester",
            "folder_id": "987654321"
        }

        with transaction.atomic():
            # First ingestion creates applicant
            res1 = FounditCandidateIngestionService.ingest_candidate(app_dict)
            self.assertTrue(res1["success"])
            self.assertFalse(res1.get("duplicate"))

            # Simulate concurrent duplicate insertion hitting database constraint
            # (bypass pre-check by mocking filter.first to return None only for pre-check)
            with patch("applications.models.CareerPortalApplicant.objects.filter") as mock_filter:
                existing_record = CareerPortalApplicant.objects.get(id=res1["applicant_id"])
                # First call (pre-check) returns None, second call (post-catch) returns existing_record
                mock_filter.return_value.first.side_effect = [None, existing_record]

                res2 = FounditCandidateIngestionService.ingest_candidate(app_dict)
                self.assertTrue(res2["success"])
                self.assertTrue(res2.get("duplicate"))
                self.assertEqual(res2["applicant_id"], res1["applicant_id"])

            # CRITICAL ASSERTION: The outer transaction is NOT aborted!
            # We can perform subsequent queries/writes in the same transaction block without TransactionManagementError
            total_count = CareerPortalApplicant.objects.filter(source="Foundit").count()
            self.assertGreaterEqual(total_count, 1)

            # Creating another record in the same outer transaction succeeds!
            post_check_applicant = CareerPortalApplicant.objects.create(
                job=self.job,
                first_name="Healthy",
                last_name="Transaction",
                email="tx_healthy@example.com",
                mobile_number="+919999888800",
                qualification="B.Tech",
                years_of_experience=3.0,
                expected_pay=700000.0,
                primary_skills="Python, Django",
                current_ctc=550000.0,
                source="Foundit",
                foundit_application_id="APP-TX-TEST-2"
            )
            self.assertIsNotNone(post_check_applicant.id)

    def test_disabled_scheduled_sync_exits_safely_without_checkpoint_or_counter_modification(self):
        """When live sync is disabled, periodic sync exits safely without altering checkpoints or counters."""
        from django.core.cache import cache
        initial_synced_at = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_synced_at
        self.posting.error_message = ""
        self.posting.save(update_fields=["last_synced_at", "error_message"])

        counter_key = f"foundit_folder_consecutive_errors_{self.posting.external_job_id}"
        cache.delete(counter_key)

        # Execute scheduled sync (FOUNDIT_LIVE_APPLICATIONS_ENABLED is false by default)
        result = FounditApplicationSyncService.sync_all_published_jobs()

        self.assertTrue(result.get("skipped"))
        self.assertIn("Live application retrieval is disabled", result.get("reason", ""))
        self.assertEqual(result.get("total_jobs_scanned"), 0)

        # Verify posting checkpoint and failure counters are completely unchanged
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_synced_at)
        self.assertEqual(self.posting.error_message, "")
        self.assertIsNone(cache.get(counter_key))

    def test_disabled_folder_sync_exits_safely(self):
        """When live sync is disabled, folder sync returns skipped without network calls, checkpoint drift or error counting."""
        from django.core.cache import cache
        from applications.integrations.foundit.client import FounditClient

        initial_synced_at = timezone.now() - datetime.timedelta(hours=5)
        self.posting.last_synced_at = initial_synced_at
        self.posting.error_message = ""
        self.posting.save(update_fields=["last_synced_at", "error_message"])

        counter_key = f"foundit_folder_consecutive_errors_{self.posting.external_job_id}"
        cache.delete(counter_key)

        client = FounditClient()  # live_applications_enabled is False, transport is None
        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.posting.external_job_id,
            client=client
        )

        self.assertTrue(summary.get("skipped"))
        self.assertIn("Live application retrieval is disabled", summary.get("reason", ""))
        self.assertFalse(summary.get("quarantined"))
        self.assertEqual(summary.get("new_ingested"), 0)

        # Database state and cache counter must remain unchanged
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_synced_at)
        self.assertEqual(self.posting.error_message, "")
        self.assertIsNone(cache.get(counter_key))

    def test_disabled_manual_sync_endpoint_rejects_safely(self):
        """When live sync is disabled, manual sync endpoint rejects with 400 LIVE_SYNC_DISABLED and queues nothing."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch("applications.integrations.foundit.tasks.sync_foundit_applications_task.delay") as mock_delay:
            res = client.post(f"/api/applications/{self.job.id}/sync-foundit/")
            self.assertEqual(res.status_code, 400)
            self.assertFalse(res.data.get("success"))
            self.assertEqual(res.data.get("code"), "LIVE_SYNC_DISABLED")
            self.assertIn("currently disabled in system configuration", res.data.get("error"))
            mock_delay.assert_not_called()

    def test_quarantine_recovery_with_reset_checkpoint(self):
        """Operators can recover quarantined folders by requesting sync with reset_checkpoint=true."""
        from django.core.cache import cache
        from rest_framework.test import APIClient

        counter_key = f"foundit_folder_consecutive_errors_{self.posting.external_job_id}"
        stale_checkpoint = timezone.now() - datetime.timedelta(days=2)
        self.posting.last_synced_at = stale_checkpoint
        self.posting.error_message = "Quarantined 2 failed and 1 unmatched application(s) after 3 retries."
        self.posting.save(update_fields=["last_synced_at", "error_message"])
        cache.set(counter_key, 3)

        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        with patch.dict("os.environ", {"FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true"}):
            with patch("applications.integrations.foundit.tasks.sync_foundit_applications_task.delay") as mock_delay:
                mock_delay.return_value = MagicMock(id="celery-resync-999")
                res = client.post(
                    f"/api/applications/{self.job.id}/sync-foundit/",
                    data={"reset_checkpoint": True},
                    format="json"
                )
                self.assertEqual(res.status_code, 202)
                self.assertTrue(res.data.get("success"))
                self.assertTrue(res.data.get("reset_checkpoint"))
                self.assertIn("full resync queued", res.data.get("message"))

                # Check that task was queued with NO applications_since argument (initiating full resync)
                mock_delay.assert_called_once_with(self.posting.external_job_id)

        # Verify operator reset: checkpoint cleared, error message cleared, failure counter deleted
        self.posting.refresh_from_db()
        self.assertIsNone(self.posting.last_synced_at)
        self.assertEqual(self.posting.error_message, "")
        self.assertIsNone(cache.get(counter_key))

    def test_client_get_applications_since_date_only_normalized_to_midnight_utc(self):
        """FounditClient.get_applications normalizes datetime.date to midnight UTC string."""
        mock_transport = MockTransport({"success": True, "data": {"folder_id": "987654321", "total_job_applications": 0, "applications": []}})
        client = FounditClient(transport=mock_transport)
        date_val = datetime.date(2026, 4, 15)
        client.get_applications("987654321", applications_since=date_val)
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-04-15T00:00:00Z")

    def test_client_get_applications_since_naive_datetime_assigned_utc(self):
        """FounditClient.get_applications interprets naive datetime as UTC and formats as %Y-%m-%dT%H:%M:%SZ."""
        mock_transport = MockTransport({"success": True, "data": {"folder_id": "987654321", "total_job_applications": 0, "applications": []}})
        client = FounditClient(transport=mock_transport)
        dt_naive = datetime.datetime(2026, 4, 15, 14, 30, 45)
        client.get_applications("987654321", applications_since=dt_naive)
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-04-15T14:30:45Z")

    def test_client_get_applications_since_aware_datetime_converted_to_utc(self):
        """FounditClient.get_applications converts non-UTC timezone-aware datetime to UTC ISO string."""
        mock_transport = MockTransport({"success": True, "data": {"folder_id": "987654321", "total_job_applications": 0, "applications": []}})
        client = FounditClient(transport=mock_transport)
        ist = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
        dt_ist = datetime.datetime(2026, 4, 15, 15, 30, 0, tzinfo=ist)
        client.get_applications("987654321", applications_since=dt_ist)
        # 15:30 IST = 10:00 UTC
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-04-15T10:00:00Z")

    def test_client_get_applications_since_string_stripped_and_preserved(self):
        """FounditClient.get_applications strips leading/trailing whitespace from string applications_since and preserves it."""
        mock_transport = MockTransport({"success": True, "data": {"folder_id": "987654321", "total_job_applications": 0, "applications": []}})
        client = FounditClient(transport=mock_transport)
        client.get_applications("987654321", applications_since="  2026-04-15T08:00:00Z  ")
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-04-15T08:00:00Z")

    def test_client_get_applications_since_none_omitted_from_params(self):
        """FounditClient.get_applications omits applications_since parameter entirely when None."""
        mock_transport = MockTransport({"success": True, "data": {"folder_id": "987654321", "total_job_applications": 0, "applications": []}})
        client = FounditClient(transport=mock_transport)
        client.get_applications("987654321", applications_since=None)
        self.assertNotIn("applications_since", mock_transport.last_params)
