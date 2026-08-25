import os
import django
from datetime import timedelta

# Initialize Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ats_backend.settings')
django.setup()

from applications.models import Note

def clean_fake_notes(dry_run=False):
    print("==========================================")
    if dry_run:
        print("DRY RUN: Identifying fake notes to soft-revert...")
    else:
        print("EXECUTE: Soft-reverting fake notes...")
    print("==========================================\n")

    # Fetch notes that start with the exact status transition phrase
    notes_query = Note.objects.filter(
        content__startswith="Status updated to "
    ).select_related('application')

    fake_notes = []
    
    for note in notes_query:
        if note.application:
            # If the note was created AFTER the application's last updated time
            # by more than 60 seconds, it is guaranteed to be a fake note from the bug.
            time_diff = (note.created_at - note.application.updated_at).total_seconds()
            
            if time_diff > 60:
                fake_notes.append(note)

    print(f"Found {len(fake_notes)} falsely generated status notes.\n")
    
    for note in fake_notes:
        app = note.application
        print(f"Fake Note: ID={note.id} | Status: {note.content.strip()}")
        print(f"  -> App ID={app.id} ({app.candidate_name}) | App Updated At: {app.updated_at.strftime('%Y-%m-%d %H:%M:%S UTC')} | Note Created At: {note.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("-" * 50)

    if not dry_run and fake_notes:
        # Soft-revert them by adding the prefix
        for note in fake_notes:
            note.content = f"[BUG_FIXED] {note.content}"
            note.save(update_fields=['content'])
        print(f"\nSUCCESS: Successfully soft-reverted {len(fake_notes)} fake notes.")
    elif dry_run:
        print("\nThis was a DRY RUN. No notes were modified.")

if __name__ == '__main__':
    # Execute the soft revert
    clean_fake_notes(dry_run=False)
