"""
Comprehensive Regression Tests for Foundit Future-Only Applicant Synchronization Safeguard.

Covers:
1. Historical applicant excluded (< cutoff).
2. New applicant imported (> cutoff).
3. Exact cutoff boundary (== cutoff).
4. Duplicate new applicant (idempotency preserved).
5. Missing application date rejected & checkpoint held.
6. Invalid application date string rejected & checkpoint held.
7. Timezone-naive application date rejected & checkpoint held.
8. Missing cutoff configuration fails closed (checkpoint held).
9. Malformed cutoff configuration fails closed (checkpoint held).
10. Two-minute overlap crossing activation cutoff is clamped to cutoff.
11. Two-minute overlap well after activation cutoff is preserved.
12. Empty filtered API response (applications=None or []) with total_job_applications > 0
    is treated as valid empty delta, checkpoint advances cleanly.
13. Scheduled synchronization (sync_all_published_jobs) enforces safeguard.
14. Direct synchronization (sync_applications_for_folder) enforces safeguard.
15. Other Foundit folders remain unaffected without requiring cutoff.
"""

import datetime
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.cache import cache

from applications.models import Application, CareerPortalApplicant, JobBoardPosting
from applications.integrations.foundit.constants import (
    FOUNDIT_JOB_BOARD_NAME,
    is_folder_future_only_protected,
    get_foundit_activation_cutoff_utc,
    parse_utc_iso_datetime,
)
from applications.integrations.foundit.candidate_ingestion import (
    FounditApplicationSyncService,
    FounditCandidateIngestionService,
)
from applications.integrations.foundit.client import FounditClient


class MockTransport:
    def __init__(self, response_payload=None, side_effect=None):
        self.response_payload = response_payload or {"success": True, "data": {"applications": []}}
        self.side_effect = side_effect
        self.call_count = 0
        self.last_url = None
        self.last_params = None
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.call_count += 1
        self.last_url = url
        self.last_params = params
        self.calls.append({"url": url, "params": params, "headers": headers})
        if self.side_effect:
            if callable(self.side_effect):
                return self.side_effect(url, params=params, headers=headers)
            raise self.side_effect
        return self.response_payload


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FounditFutureSyncSafeguardTests(TestCase):
    PROTECTED_FOLDER_ID = "156278847"
    UNPROTECTED_FOLDER_ID = "999999"
    CUTOFF_STR = "2026-10-29T10:00:00Z"

    def setUp(self):
        super().setUp()
        cache.clear()

        # Create target job requirement (distinguished by candidate_name='')
        self.job = Application.objects.create(
            position="Senior Python Engineer",
            client_name="Test Enterprise Client",
            technology="Python, React",
            experience=5.0,
            candidate_name=""
        )

        # Create JobBoardPosting for protected folder
        self.posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board=FOUNDIT_JOB_BOARD_NAME,
            external_job_id=self.PROTECTED_FOLDER_ID,
            status="PUBLISHED",
            last_synced_at=None
        )

        # Create target job and posting for unprotected folder
        self.unprotected_job = Application.objects.create(
            position="Frontend Developer",
            client_name="Test Enterprise Client",
            technology="React, TypeScript",
            experience=3.0,
            candidate_name=""
        )
        self.unprotected_posting = JobBoardPosting.objects.create(
            job=self.unprotected_job,
            job_board=FOUNDIT_JOB_BOARD_NAME,
            external_job_id=self.UNPROTECTED_FOLDER_ID,
            status="UNPUBLISHED",
            last_synced_at=None
        )

        # Base applicant payload
        self.base_app = {
            "application_id": "APP-101",
            "folder_id": self.PROTECTED_FOLDER_ID,
            "application_date": "2026-10-29T11:00:00Z",
            "profile_details": {
                "candidate_id": "CAND-101",
                "name": "Jane Doe",
                "email": "jane.doe@example.com",
                "phone": "9876543210",
                "years_of_experience": 5.0,
            }
        }

    def tearDown(self):
        cache.clear()
        super().tearDown()

    # 1. Historical applicant excluded (< cutoff)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_historical_applicant_excluded(self):
        historical_app = dict(self.base_app)
        historical_app["application_id"] = "HIST-001"
        historical_app["application_date"] = "2026-10-29T09:59:59Z"  # 1 second before cutoff

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [historical_app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("before_cutoff_excluded"), 1)
        self.assertEqual(summary.get("new_ingested"), 0)
        self.assertEqual(summary.get("failed_errors"), 0)
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="HIST-001").exists())

    # 2. New applicant imported (> cutoff)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    @patch("applications.ai.tasks.score_applicant_resume_task.delay")
    def test_new_applicant_imported(self, mock_score_task):
        new_app = dict(self.base_app)
        new_app["application_id"] = "NEW-001"
        new_app["application_date"] = "2026-10-29T10:00:01Z"  # 1 second after cutoff

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [new_app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("new_ingested"), 1)
        self.assertEqual(summary.get("failed_errors"), 0)
        applicant = CareerPortalApplicant.objects.filter(foundit_application_id="NEW-001").first()
        self.assertIsNotNone(applicant)
        self.assertEqual(applicant.job, self.job)
        self.assertEqual(applicant.source, FOUNDIT_JOB_BOARD_NAME)
        mock_score_task.assert_called_once_with(applicant.id)

    # 3. Exact cutoff boundary (== cutoff)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    @patch("applications.ai.tasks.score_applicant_resume_task.delay")
    def test_exact_cutoff_boundary_eligible(self, mock_score_task):
        boundary_app = dict(self.base_app)
        boundary_app["application_id"] = "EXACT-001"
        boundary_app["application_date"] = "2026-10-29T10:00:00Z"  # Exact cutoff boundary

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [boundary_app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("new_ingested"), 1)
        self.assertTrue(CareerPortalApplicant.objects.filter(foundit_application_id="EXACT-001").exists())

    # 4. Duplicate new applicant (idempotency preserved)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    @patch("applications.ai.tasks.score_applicant_resume_task.delay")
    def test_duplicate_new_applicant_skipped(self, mock_score_task):
        app = dict(self.base_app)
        app["application_id"] = "DUP-001"
        app["application_date"] = "2026-10-29T10:05:00Z"

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [app]
            }
        })
        client = FounditClient(transport=mock_transport)

        # First sync
        summary1 = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )
        self.assertEqual(summary1.get("new_ingested"), 1)
        self.assertEqual(summary1.get("duplicates_skipped"), 0)

        # Second sync with identical app
        summary2 = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )
        self.assertEqual(summary2.get("new_ingested"), 0)
        self.assertEqual(summary2.get("duplicates_skipped"), 1)
        self.assertEqual(CareerPortalApplicant.objects.filter(foundit_application_id="DUP-001").count(), 1)

    # 5. Missing application date rejected & checkpoint held
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_missing_application_date_rejected_and_checkpoint_held(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        app = dict(self.base_app)
        app["application_id"] = "NODATE-001"
        app.pop("application_date", None)

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("failed_errors"), 1)
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="NODATE-001").exists())

        # Checkpoint MUST be held
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 6. Invalid application date string rejected & checkpoint held
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_invalid_application_date_rejected_and_checkpoint_held(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        app = dict(self.base_app)
        app["application_id"] = "INVDATE-001"
        app["application_date"] = "not-a-valid-date"

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("failed_errors"), 1)
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="INVDATE-001").exists())

        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 7. Timezone-naive application date rejected & checkpoint held
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_timezone_naive_date_rejected_and_checkpoint_held(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        app = dict(self.base_app)
        app["application_id"] = "NAIVE-001"
        app["application_date"] = "2026-10-29 10:30:00"  # Naive without tz indicator or Z

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": [app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("failed_errors"), 1)
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="NAIVE-001").exists())

        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 8. Missing cutoff configuration fails closed (checkpoint held)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "",  # Empty/missing
    })
    def test_missing_cutoff_config_fails_closed(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        mock_transport = MockTransport()
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        # Fails closed before API call!
        self.assertEqual(mock_transport.call_count, 0)
        self.assertIn("Safeguard error", summary.get("error", ""))
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 9. Malformed cutoff configuration fails closed (checkpoint held)
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "garbage-timestamp",
    })
    def test_malformed_cutoff_config_fails_closed(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        mock_transport = MockTransport()
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(mock_transport.call_count, 0)
        self.assertIn("Safeguard error", summary.get("error", ""))
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 10. Two-minute overlap crossing activation cutoff is clamped to cutoff
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_overlap_crossing_cutoff_clamped_to_cutoff(self):
        # last_synced_at is 1 minute after cutoff (10:01:00Z)
        # 2-minute overlap would be 09:59:00Z (prior to cutoff)
        checkpoint = datetime.datetime(2026, 10, 29, 10, 1, 0, tzinfo=datetime.timezone.utc)
        self.posting.last_synced_at = checkpoint
        self.posting.save()

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": []
            }
        })
        client = FounditClient(transport=mock_transport)

        FounditApplicationSyncService.sync_all_published_jobs(client=client)

        # applications_since sent to API MUST be clamped to exact cutoff (10:00:00Z), NOT 09:59:00Z!
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-10-29T10:00:00Z")

    # 11. Two-minute overlap well after activation cutoff is preserved
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_overlap_well_after_cutoff_is_preserved(self):
        # last_synced_at is 10 minutes after cutoff (10:10:00Z)
        # 2-minute overlap is 10:08:00Z (well after cutoff)
        checkpoint = datetime.datetime(2026, 10, 29, 10, 10, 0, tzinfo=datetime.timezone.utc)
        self.posting.last_synced_at = checkpoint
        self.posting.save()

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.PROTECTED_FOLDER_ID,
                "total_job_applications": 116,
                "applications": []
            }
        })
        client = FounditClient(transport=mock_transport)

        FounditApplicationSyncService.sync_all_published_jobs(client=client)

        # applications_since sent to API MUST be 10:08:00Z (2 minutes overlap preserved)
        self.assertEqual(mock_transport.last_params.get("applications_since"), "2026-10-29T10:08:00Z")

    # 12. Empty filtered API response (applications=None or []) with total_job_applications > 0
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_empty_filtered_response_advances_checkpoint_cleanly(self):
        for empty_val in [None, []]:
            with self.subTest(empty_val=empty_val):
                initial_checkpoint = timezone.now() - datetime.timedelta(hours=1)
                self.posting.last_synced_at = initial_checkpoint
                self.posting.save()

                mock_transport = MockTransport({
                    "success": True,
                    "data": {
                        "folder_id": self.PROTECTED_FOLDER_ID,
                        "total_job_applications": 116,
                        "applications": empty_val
                    }
                })
                client = FounditClient(transport=mock_transport)

                summary = FounditApplicationSyncService.sync_applications_for_folder(
                    folder_id=self.PROTECTED_FOLDER_ID,
                    client=client,
                    applications_since="2026-10-29T10:00:00Z"
                )

                self.assertNotIn("error", summary)
                self.assertEqual(summary.get("failed_errors"), 0)
                self.posting.refresh_from_db()
                self.assertGreater(self.posting.last_synced_at, initial_checkpoint)

    # 13. Direct ingestion defense-in-depth safeguard
    @patch.dict("os.environ", {
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_direct_ingest_candidate_defense_in_depth(self):
        historical_payload = {
            "application_id": "DIRECT-HIST-001",
            "folder_id": self.PROTECTED_FOLDER_ID,
            "profile_details": {"name": "Old Applicant", "email": "old@example.com"},
            "application_date": "2026-10-29T09:30:00Z"
        }
        res = FounditCandidateIngestionService.ingest_candidate(historical_payload)
        self.assertFalse(res.get("success"))
        self.assertEqual(res.get("code"), "SAFEGUARD_BEFORE_CUTOFF")
        self.assertFalse(CareerPortalApplicant.objects.filter(foundit_application_id="DIRECT-HIST-001").exists())

    # 14. Unprotected folder remains unaffected without requiring cutoff
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "",  # Unset!
    })
    @patch("applications.ai.tasks.score_applicant_resume_task.delay")
    def test_unprotected_folder_unaffected(self, mock_score_task):
        unprotected_app = {
            "application_id": "UNPROT-001",
            "folder_id": self.UNPROTECTED_FOLDER_ID,
            "profile_details": {
                "candidate_id": "CAND-UNPROT-001",
                "name": "Standard Applicant",
                "email": "standard@example.com",
                "phone": "9876543211",
                "years_of_experience": 3.0,
            },
            "application_date": "2026-10-20T10:00:00Z"  # Date in the past
        }

        mock_transport = MockTransport({
            "success": True,
            "data": {
                "folder_id": self.UNPROTECTED_FOLDER_ID,
                "total_job_applications": 1,
                "applications": [unprotected_app]
            }
        })
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.UNPROTECTED_FOLDER_ID,
            client=client
        )

        self.assertEqual(summary.get("new_ingested"), 1)
        self.assertTrue(CareerPortalApplicant.objects.filter(foundit_application_id="UNPROT-001").exists())

    # 15. Correction 1: Malformed applications value (dict, str, int, bool) rejected & checkpoint held
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_malformed_applications_types_rejected_and_checkpoint_held(self):
        malformed_values = [
            {"single_app": {"id": 1}},  # dict instead of list
            "unexpected_string",         # str
            12345,                       # int
            True,                        # bool
        ]

        for malformed_val in malformed_values:
            with self.subTest(malformed_val=type(malformed_val).__name__):
                initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
                self.posting.last_synced_at = initial_checkpoint
                self.posting.save()

                mock_transport = MockTransport({
                    "success": True,
                    "data": {
                        "folder_id": self.PROTECTED_FOLDER_ID,
                        "total_job_applications": 5,
                        "applications": malformed_val
                    }
                })
                client = FounditClient(transport=mock_transport)

                summary = FounditApplicationSyncService.sync_applications_for_folder(
                    folder_id=self.PROTECTED_FOLDER_ID,
                    client=client,
                    applications_since="2026-10-29T10:00:00Z"
                )

                self.assertIn("error", summary)
                self.assertIn("Malformed API response", summary.get("error", ""))
                self.assertGreater(summary.get("failed_errors", 0), 0)

                # Checkpoint MUST be held!
                self.posting.refresh_from_db()
                self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 16. Correction 1: Malformed top-level response envelope rejected & checkpoint held
    @patch.dict("os.environ", {
        "FOUNDIT_LIVE_APPLICATIONS_ENABLED": "true",
        "FOUNDIT_APPLICATIONS_MIN_DATE_UTC": "2026-10-29T10:00:00Z",
    })
    def test_malformed_response_envelope_rejected_and_checkpoint_held(self):
        initial_checkpoint = timezone.now() - datetime.timedelta(hours=2)
        self.posting.last_synced_at = initial_checkpoint
        self.posting.save()

        # Transport returns a string or non-dict instead of JSON dict
        mock_transport = MockTransport(response_payload="<html>502 Bad Gateway</html>")
        client = FounditClient(transport=mock_transport)

        summary = FounditApplicationSyncService.sync_applications_for_folder(
            folder_id=self.PROTECTED_FOLDER_ID,
            client=client,
            applications_since="2026-10-29T10:00:00Z"
        )

        self.assertIn("error", summary)
        self.assertIn("Malformed API response", summary.get("error", ""))
        self.assertGreater(summary.get("failed_errors", 0), 0)

        # Checkpoint MUST be held!
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.last_synced_at, initial_checkpoint)

    # 17. Correction 2: Mandatory protected folder 156278847 cannot be excluded via env configuration
    @patch.dict("os.environ", {
        "FOUNDIT_FUTURE_ONLY_FOLDER_IDS": "999999",  # Attempt to override with different folder
    })
    def test_mandatory_protected_folder_cannot_be_excluded_via_env(self):
        from applications.integrations.foundit.constants import (
            get_foundit_future_only_folder_ids,
            is_folder_future_only_protected,
            MANDATORY_FUTURE_ONLY_FOLDER_IDS,
        )

        protected_set = get_foundit_future_only_folder_ids()
        # Mandatory folder MUST still be present
        self.assertIn("156278847", protected_set)
        # Additional folder from env must also be present
        self.assertIn("999999", protected_set)
        # Boolean check must return True
        self.assertTrue(is_folder_future_only_protected("156278847"))
        self.assertTrue(is_folder_future_only_protected("999999"))

    # 18. Correction 2: Multiple additional folders and empty env string tests
    def test_mandatory_folder_always_protected_across_all_env_configurations(self):
        from applications.integrations.foundit.constants import (
            get_foundit_future_only_folder_ids,
            is_folder_future_only_protected,
        )

        test_configs = [
            ("", {"156278847"}),
            ("   ", {"156278847"}),
            ("888888, 777777", {"156278847", "888888", "777777"}),
            ("156278847", {"156278847"}),
        ]

        for env_val, expected_subset in test_configs:
            with patch.dict("os.environ", {"FOUNDIT_FUTURE_ONLY_FOLDER_IDS": env_val}):
                result = get_foundit_future_only_folder_ids()
                for folder_id in expected_subset:
                    self.assertIn(folder_id, result)
                self.assertTrue(is_folder_future_only_protected("156278847"))
