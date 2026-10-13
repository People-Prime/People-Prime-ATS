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

