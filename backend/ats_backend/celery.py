import os
from celery import Celery

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')

app = Celery('ats_backend')

# Load task sources from all registered Django app configs
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in all installed apps and integration packages
app.autodiscover_tasks(['applications', 'applications.ai', 'applications.integrations.foundit', 'users'])

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
