import os, django  
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')  
django.setup()  
from applications.models import Application  
from django.utils import timezone  
import datetime  
today = datetime.date.today().strftime('%%Y-%%m-%%d')  
published = Application.objects.filter(candidate_name='', publish_to_career_page=True).exclude(status__iexact='Closed')  
today_published = [a for a in published if (a.updated_at or a.created_at).strftime('%%Y-%%m-%%d') == today]  
codes_today = set()  
for a in today_published:  
    rem = a.remarks or ''  
    if 'Job Code:' in rem:  
        c = rem.split('Job Code:')[1].split('\n')[0].strip()  
        codes_today.add(c)  
print('TODAY_UNIQUE_PUBLISHED_JOBS_COUNT:', len(codes_today)) 
