import gzip
import io
from unittest.mock import MagicMock, patch
import requests
import urllib3
from django.test import TestCase
from botocore.exceptions import ClientError
from applications.models import Application, CareerPortalApplicant, JobBoardPosting
from applications.integrations.foundit.candidate_ingestion import FounditCandidateIngestionService


class FounditResumePipelineRegressionTests(TestCase):
    """
    Comprehensive regression tests for Foundit resume download and S3 upload pipeline:
    1. Realistic requests.Response with normal uncompressed PDF -> verified, uploaded as uncompressed PDF.
    2. Realistic requests.Response with HTTP Content-Encoding: gzip -> verified, uploaded as uncompressed PDF.
    3. Raw GZIP-compressed payload (\x1f\x8b) without Content-Encoding header -> decompressed, verified, uploaded as uncompressed PDF.
    4. Truncated GZIP stream (decompressor.eof is False) -> fails safely, falls back to URL.
    5. Bounded decompression size limit / zip-bomb (> 25MB) -> aborted safely, falls back to URL.
    6. Normal uncompressed oversized resume (> 25MB) -> aborted safely, falls back to URL.
    7. Invalid PDF response (HTML or non-PDF bytes) -> rejected by header check, falls back to URL.
    8. GZIP-compressed invalid response (gzipped HTML) -> rejected by header check, falls back to URL.
    9. Corrupted GZIP bytes -> fails decompression safely, falls back to URL.
    10. Download failure (HTTP 404, HTTP 500) -> falls back to URL.
    11. S3 upload failure (ClientError on upload_fileobj) -> falls back to URL without failing applicant creation.
    12. Empty response -> aborted safely, falls back to URL.
    13. 1-byte initial chunk GZIP payload -> robustly buffered and decompressed.
    14. 1-byte initial chunk raw PDF payload -> robustly buffered and uploaded.
    15. Concatenated multi-member GZIP stream -> completely decompressed into full PDF.
    16. Trailing garbage in same chunk after GZIP stream -> rejected safely, falls back to URL.
    17. Trailing garbage in subsequent chunk after GZIP stream -> rejected safely, falls back to URL.
    18. Trailing 1-byte junk after GZIP stream -> rejected safely, falls back to URL.
    19. Truncated concatenated GZIP member -> rejected safely, falls back to URL.
    """

    def setUp(self):
        self.job = Application.objects.create(
            candidate_name="",
            position="Senior Python Developer",
            technology="Python, Django",
            experience=4.0,
            country="India",
            city="Hyderabad",
            state="Telangana",
            remarks="[Job Details]\nJob Code: PPW-7777\n"
        )
        self.posting = JobBoardPosting.objects.create(
            job=self.job,
            job_board="Foundit",
            external_job_id="FLDR-7777",
            status="PUBLISHED"
        )
        self.mock_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Title (Test Resume) >>\nendobj\ntrailer\n<< /Size 1 >>\n%%EOF"
        self.mock_gzip_pdf_bytes = gzip.compress(self.mock_pdf_bytes)

        self.env_patcher = patch.dict("os.environ", {
            "AWS_ACCESS_KEY_ID": "mock_access_key",
            "AWS_SECRET_ACCESS_KEY": "mock_secret_key",
            "AWS_STORAGE_BUCKET_NAME": "ats-resumestorage",
            "AWS_S3_REGION_NAME": "ap-south-1"
        })
        self.env_patcher.start()

        # Mock celery score task to prevent timeout delays during tests
        self.celery_patcher = patch("applications.ai.tasks.score_applicant_resume_task.delay")
        self.mock_celery = self.celery_patcher.start()

    def tearDown(self):
        self.celery_patcher.stop()
        self.env_patcher.stop()

    def _make_app_dict(self, app_id="APP_RESUME_TEST", url="https://foundit.in/download/resume.pdf"):
        return {
            "application_id": app_id,
            "candidate_name": "Test Candidate",
            "folder_id": "FLDR-7777",
            "resume_file_download_url": url,
            "profile_details": {
                "email": "test.candidate@example.com",
                "phone": "9876543210"
            }
        }

    # 1. Realistic requests.Response with normal uncompressed PDF
    @patch("requests.get")
    @patch("boto3.client")
    def test_realistic_response_normal_pdf_uploads_uncompressed(self, mock_boto, mock_get):
        real_res = requests.Response()
        real_res.status_code = 200
        real_res.raw = io.BytesIO(self.mock_pdf_bytes)
        mock_get.return_value.__enter__.return_value = real_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_NORMAL_PDF")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_NORMAL_PDF.pdf")

        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(len(uploaded_chunks), 1)
        self.assertEqual(uploaded_chunks[0], self.mock_pdf_bytes)
        call_args, call_kwargs = mock_s3.upload_fileobj.call_args
        self.assertEqual(call_args[1], "ats-resumestorage")
        self.assertEqual(call_args[2], "foundit_APP_NORMAL_PDF.pdf")
        self.assertEqual(call_kwargs.get("ExtraArgs"), {"ContentType": "application/pdf"})

    # 2. Realistic requests.Response with HTTP Content-Encoding: gzip
    @patch("requests.get")
    @patch("boto3.client")
    def test_realistic_response_http_gzip_content_encoding(self, mock_boto, mock_get):
        """Simulates HTTP server sending Content-Encoding: gzip handled automatically by requests/urllib3."""
        urllib3_resp = urllib3.response.HTTPResponse(
            body=io.BytesIO(self.mock_gzip_pdf_bytes),
            headers={"Content-Encoding": "gzip"},
            preload_content=False
        )
        real_res = requests.Response()
        real_res.status_code = 200
        real_res.raw = urllib3_resp
        mock_get.return_value.__enter__.return_value = real_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_HTTP_GZIP")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_HTTP_GZIP.pdf")

        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], self.mock_pdf_bytes)
        self.assertTrue(uploaded_chunks[0].startswith(b"%PDF-"))

    # 3. Raw GZIP payload (\x1f\x8b) without Content-Encoding header
    @patch("requests.get")
    @patch("boto3.client")
    def test_raw_gzip_payload_is_decompressed_before_upload(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        chunk1 = self.mock_gzip_pdf_bytes[:30]
        chunk2 = self.mock_gzip_pdf_bytes[30:]
        mock_res.iter_content.return_value = [chunk1, chunk2]
        mock_get.return_value.__enter__.return_value = mock_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_RAW_GZIP")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_RAW_GZIP.pdf")

        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], self.mock_pdf_bytes)
        self.assertTrue(uploaded_chunks[0].startswith(b"%PDF-"))
        self.assertFalse(uploaded_chunks[0].startswith(b"\x1f\x8b"))

    # 4. Truncated GZIP stream (decompressor.eof is False)
    @patch("requests.get")
    @patch("boto3.client")
    def test_truncated_gzip_stream_falls_back_to_url(self, mock_boto, mock_get):
        truncated_gzip = self.mock_gzip_pdf_bytes[:20]
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [truncated_gzip]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_TRUNCATED_GZIP", "https://foundit.in/download/truncated.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/truncated.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 5. Bounded decompression size limit / zip-bomb (> 25MB)
    @patch("requests.get")
    @patch("boto3.client")
    def test_gzip_bomb_decompression_limit_falls_back_to_url(self, mock_boto, mock_get):
        bomb_data = b"%PDF-1.4" + (b"0" * (26 * 1024 * 1024))
        compressed_bomb = gzip.compress(bomb_data)
        self.assertLess(len(compressed_bomb), 100 * 1024)

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [compressed_bomb]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_GZIP_BOMB", "https://foundit.in/download/bomb.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/bomb.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 6. Uncompressed oversized resume (> 25MB)
    @patch("requests.get")
    @patch("boto3.client")
    def test_uncompressed_oversized_resume_aborts_upload(self, mock_boto, mock_get):
        large_chunk = b"%PDF-1.4" + (b"A" * (1024 * 1024))
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [large_chunk] * 26
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_OVERSIZED", "https://foundit.in/download/oversized.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/oversized.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 7. Invalid PDF response (HTML error page)
    @patch("requests.get")
    @patch("boto3.client")
    def test_invalid_pdf_response_falls_back_to_url(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [b"<!DOCTYPE html><html><body>Error 404: Not Found</body></html>"]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_INVALID_HTML", "https://foundit.in/download/html_error.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/html_error.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 8. GZIP-compressed invalid response (gzipped HTML)
    @patch("requests.get")
    @patch("boto3.client")
    def test_gzip_compressed_invalid_content_falls_back_to_url(self, mock_boto, mock_get):
        gzipped_html = gzip.compress(b"<html><body>Internal Server Error</body></html>")
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [gzipped_html]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_GZIP_HTML", "https://foundit.in/download/gzip_html.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/gzip_html.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 9. Corrupted GZIP response
    @patch("requests.get")
    @patch("boto3.client")
    def test_corrupted_gzip_stream_falls_back_to_url(self, mock_boto, mock_get):
        corrupt_gzip = b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03corrupt_data_garbage"
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [corrupt_gzip]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_CORRUPT_GZIP", "https://foundit.in/download/corrupt.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/corrupt.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 10. Download failure: HTTP 404 or 500
    @patch("requests.get")
    @patch("boto3.client")
    def test_download_http_error_falls_back_to_url(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 404
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_HTTP_404", "https://foundit.in/download/missing.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/missing.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 11. S3 upload failure (ClientError)
    @patch("requests.get")
    @patch("boto3.client")
    def test_s3_upload_failure_falls_back_to_url(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [self.mock_pdf_bytes]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "upload_fileobj"
        )
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_S3_FAIL", "https://foundit.in/download/s3_error.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/s3_error.pdf")

    # 12. Empty response
    @patch("requests.get")
    @patch("boto3.client")
    def test_empty_response_aborts_upload_and_falls_back(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [b""]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_EMPTY", "https://foundit.in/download/empty.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/empty.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 13. 1-byte initial chunk GZIP payload
    @patch("requests.get")
    @patch("boto3.client")
    def test_one_byte_initial_chunk_gzip_decompressed(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        # First chunk is only 1 byte (\x1f), second chunk has rest of gzip stream
        mock_res.iter_content.return_value = [
            self.mock_gzip_pdf_bytes[:1],
            self.mock_gzip_pdf_bytes[1:]
        ]
        mock_get.return_value.__enter__.return_value = mock_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_ONE_BYTE_GZIP")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_ONE_BYTE_GZIP.pdf")
        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], self.mock_pdf_bytes)

    # 14. 1-byte initial chunk raw PDF payload
    @patch("requests.get")
    @patch("boto3.client")
    def test_one_byte_initial_chunk_raw_pdf_uploaded(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        # First chunk is only 1 byte (b'%'), second chunk has rest of PDF
        mock_res.iter_content.return_value = [
            self.mock_pdf_bytes[:1],
            self.mock_pdf_bytes[1:]
        ]
        mock_get.return_value.__enter__.return_value = mock_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_ONE_BYTE_RAW")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_ONE_BYTE_RAW.pdf")
        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], self.mock_pdf_bytes)

    # 15. Concatenated multi-member GZIP stream
    @patch("requests.get")
    @patch("boto3.client")
    def test_concatenated_gzip_stream_decompressed_completely(self, mock_boto, mock_get):
        part1 = b"%PDF-1.4\n1 0 obj\n<< /Title (Part 1) >>\nendobj\n"
        part2 = b"trailer\n<< /Size 1 >>\n%%EOF"
        full_pdf = part1 + part2
        gz_concat = gzip.compress(part1) + gzip.compress(part2)

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [gz_concat]
        mock_get.return_value.__enter__.return_value = mock_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_CONCAT_GZIP")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_CONCAT_GZIP.pdf")
        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], full_pdf)

    # 16. Trailing garbage in same chunk after GZIP stream
    @patch("requests.get")
    @patch("boto3.client")
    def test_trailing_garbage_in_same_chunk_rejected(self, mock_boto, mock_get):
        payload_with_junk = self.mock_gzip_pdf_bytes + b"trailing_garbage_data"
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [payload_with_junk]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_TRAILING_JUNK", "https://foundit.in/download/trailing.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/trailing.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 17. Trailing garbage in subsequent chunk after GZIP stream
    @patch("requests.get")
    @patch("boto3.client")
    def test_trailing_garbage_in_subsequent_chunk_rejected(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [
            self.mock_gzip_pdf_bytes,
            b"subsequent_chunk_garbage"
        ]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_TRAILING_CHUNK", "https://foundit.in/download/trailing_chunk.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/trailing_chunk.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 18. Trailing 1-byte junk after GZIP stream
    @patch("requests.get")
    @patch("boto3.client")
    def test_trailing_one_byte_junk_rejected(self, mock_boto, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [
            self.mock_gzip_pdf_bytes,
            b"X"
        ]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_TRAILING_1BYTE", "https://foundit.in/download/trailing_1byte.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/trailing_1byte.pdf")
        mock_s3.upload_fileobj.assert_not_called()

    # 19. Truncated concatenated GZIP member
    @patch("requests.get")
    @patch("boto3.client")
    def test_truncated_concatenated_gzip_rejected(self, mock_boto, mock_get):
        part1_gz = gzip.compress(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
        part2_gz = gzip.compress(b"trailer\n<<>>\n%%EOF")
        truncated_concat = part1_gz + part2_gz[:5]

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [truncated_concat]
        mock_get.return_value.__enter__.return_value = mock_res

        mock_s3 = MagicMock()
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_TRUNC_CONCAT", "https://foundit.in/download/trunc_concat.pdf")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "https://foundit.in/download/trunc_concat.pdf")
        mock_s3.upload_fileobj.assert_not_called()
    # 20. Concatenated GZIP where second member's \x1f\x8b header is split across chunks
    @patch("requests.get")
    @patch("boto3.client")
    def test_concatenated_gzip_header_split_across_chunks(self, mock_boto, mock_get):
        part1 = b"%PDF-1.4\n1 0 obj\n<< /Title (Split Part 1) >>\nendobj\n"
        part2 = b"trailer\n<< /Size 1 >>\n%%EOF"
        full_pdf = part1 + part2
        part1_gz = gzip.compress(part1)
        part2_gz = gzip.compress(part2)

        # Chunk 1 ends with \x1f (the first byte of member 2)
        # Chunk 2 starts with \x8b (the second byte of member 2)
        chunk1 = part1_gz + part2_gz[:1]
        chunk2 = part2_gz[1:]

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [chunk1, chunk2]
        mock_get.return_value.__enter__.return_value = mock_res

        uploaded_chunks = []
        def capture_upload(fileobj, bucket, key, ExtraArgs=None):
            uploaded_chunks.append(fileobj.read())

        mock_s3 = MagicMock()
        mock_s3.upload_fileobj.side_effect = capture_upload
        mock_boto.return_value = mock_s3

        app_dict = self._make_app_dict("APP_SPLIT_CONCAT")
        res = FounditCandidateIngestionService.ingest_candidate(app_dict)

        self.assertTrue(res["success"])
        applicant = CareerPortalApplicant.objects.get(id=res["applicant_id"])
        self.assertEqual(applicant.resume, "s3://ats-resumestorage/foundit_APP_SPLIT_CONCAT.pdf")
        mock_s3.upload_fileobj.assert_called_once()
        self.assertEqual(uploaded_chunks[0], full_pdf)
