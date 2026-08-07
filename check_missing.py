import os, django  
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')  
django.setup()  
from applications.models import Application  
from applications.serializers import PublicJobSerializer  
import datetime  
today = datetime.date.today().strftime('%%Y-%%m-%%d')  
all_reqs = Application.objects.filter(candidate_name='')  
today_reqs = [a for a in all_reqs if (a.updated_at or a.created_at).strftime('%%Y-%%m-%%d') == today]  
codes_all_today = set()  
for a in today_reqs:  
    rem = a.remarks or ''  
    c = rem.split('Job Code:')[1].split('\n')[0].strip() if 'Job Code:' in rem else f'{a.client_name}\{a.position}'  
    codes_all_today.add(c)  
public_qs = Application.objects.filter(candidate_name='', publish_to_career_page=True).exclude(status__iexact='Closed')  
public_ids = set(public_qs.values_list('id', flat=True))  
codes_in_public = set()  
for a in public_qs:  
    rem = a.remarks or ''  
    c = rem.split('Job Code:')[1].split('\n')[0].strip() if 'Job Code:' in rem else f'{a.client_name}\{a.position}'  
    codes_in_public.add(c)  
missing_codes = codes_all_today - codes_in_public  
print('TODAY_DASHBOARD_JOBS:', len(codes_all_today))  
print('TODAY_JOBS_PRESENT_IN_PUBLIC_API:', len(codes_all_today.intersection(codes_in_public)))  
print('MISSING_FROM_PUBLIC_API:', len(missing_codes)) 
