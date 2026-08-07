import os, django  
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')  
django.setup()  
from applications.models import Application  
from users.models import User  
ceo = User.objects.filter(role='CEO').first()  
print('CEO:', ceo.email if ceo else 'None')  
user_apps = Application.objects.filter(candidate_name='', assigned_employee=ceo) if ceo else Application.objects.none()  
print('TOTAL_CEO_JOBS:', user_apps.count())  
print('CEO_JOBS_PUBLISHED:', user_apps.filter(publish_to_career_page=True).count())  
print('CEO_JOBS_NOT_PUBLISHED:', user_apps.filter(publish_to_career_page=False).count())  
print('CEO_JOBS_CLOSED:', user_apps.filter(status__iexact='Closed').count()) 
