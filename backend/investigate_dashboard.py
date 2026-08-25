import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')
django.setup()

from applications.models import Application, Note

def investigate():
    print("Fetching anomalies...")
    
    # We are looking for applications that are somehow showing up in the frontend
    # as Client Submissions for Aug 24, but have an updated_at in July.
    # Let's find all applications that have the literal string "N/A" or are created in July.
    
    # Find applications created on 2026-07-07 that have a Note created on 2026-08-24
    apps_with_notes = Application.objects.filter(
        notes__created_at__year=2026,
        notes__created_at__month=8,
        notes__created_at__day=24
    ).distinct()
    
    print(f"Total apps with a note on Aug 24: {apps_with_notes.count()}")
    
    # Print the ones that have created_at in July
    anomalies = apps_with_notes.filter(created_at__month=7)
    print(f"Apps with a note on Aug 24, but created in July: {anomalies.count()}")
    
    for app in anomalies[:5]:
        print(f"\n--- App ID: {app.id} ---")
        print(f"Candidate Name: '{app.candidate_name}'")
        print(f"Status: {app.status}")
        print(f"Created At: {app.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Updated At: {app.updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        notes = app.notes.all()
        for note in notes:
            print(f"  Note ID {note.id} | Created: {note.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"  Content: {repr(note.content)}")
    
    # Also, what if there are apps created on July 7, updated in July, but somehow transition_dates is set?
    # Let's check how many apps actually have transition_dates (this is a serializer property, not DB)
    
if __name__ == '__main__':
    investigate()
