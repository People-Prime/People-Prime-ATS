from unittest.mock import MagicMock
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
