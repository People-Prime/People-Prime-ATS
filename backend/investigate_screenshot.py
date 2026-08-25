import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')
django.setup()

from applications.models import Application

def investigate_screenshot():
    print("Searching for the exact applications in the screenshot...")
    
    # We are looking for an application with:
    # created_at around July 7, 2026
    # some field (maybe remarks) containing "2100000"
    
    apps = Application.objects.filter(
        created_at__year=2026,
        created_at__month=7,
        remarks__icontains="2100000"
    )
    
    print(f"Found {apps.count()} apps matching '2100000' in July.")
    
    for app in apps:
        print(f"\n--- App ID: {app.id} ---")
        print(f"Candidate Name: {repr(app.candidate_name)}")
        print(f"Candidate Email: {repr(app.candidate_email)}")
        print(f"Status: {app.status}")
        print(f"Created At: {app.created_at}")
        print(f"Updated At: {app.updated_at}")
        print(f"Remarks: {repr(app.remarks)}")
        notes = app.notes.all()
        for note in notes:
            print(f"  Note {note.id} | {note.created_at} | {repr(note.content)}")

if __name__ == '__main__':
    investigate_screenshot()
