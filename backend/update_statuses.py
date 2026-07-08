import os
import django
from datetime import datetime, timedelta
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')
django.setup()

from applications.models import Application

# Yesterday's date range
yesterday = timezone.now() - timedelta(days=1)
start_of_yesterday = datetime(yesterday.year, yesterday.month, yesterday.day, 0, 0, 0, tzinfo=timezone.utc)
end_of_yesterday = datetime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59, tzinfo=timezone.utc)

# Find all applications created yesterday with status 'Submitted'
apps_to_update = Application.objects.filter(
    created_at__gte=start_of_yesterday,
    created_at__lte=end_of_yesterday,
    status='Submitted'
)

count = apps_to_update.count()
print(f"Found {count} applications created yesterday (between {start_of_yesterday} and {end_of_yesterday}) with status 'Submitted'.")

# Update them to 'New'
updated = apps_to_update.update(status='New')
print(f"Successfully updated {updated} applications status to 'New'.")
