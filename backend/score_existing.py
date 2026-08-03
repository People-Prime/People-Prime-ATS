import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')

import django
django.setup()

from applications.models import CareerPortalApplicant
from applications.ai.service import process_applicant_ai_match

apps = CareerPortalApplicant.objects.all()
print(f'Total applicants: {apps.count()}')

for a in apps:
    score = process_applicant_ai_match(a.id)
    print(f'Applicant {a.id}: {a.email} -> Score: {score}')

print('Done!')
