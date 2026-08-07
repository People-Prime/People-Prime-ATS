import os, django  
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')  
django.setup()  
from applications.models import Application  
published = Application.objects.filter(candidate_name='', publish_to_career_page=True).exclude(status__iexact='Closed')  
codes = set()  
for a in published:  
    rem = a.remarks or ''  
    if 'Job Code:' in rem:  
        c = rem.split('Job Code:')[1].split('\n')[0].strip()  
        codes.add(c)  
    else:  
        codes.add(f'{a.client_name}\{a.position}')  
print('TOTAL_PUBLISHED_RECORDS_IN_DB:', published.count())  
print('UNIQUE_PUBLISHED_JOBS_COUNT:', len(codes)) 
