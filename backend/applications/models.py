from django.db import models
from django.conf import settings
from pgvector.django import VectorField

class ApplicationStatus(models.TextChoices):
    NEW = 'New', 'New'
    SUBMITTED = 'Submitted', 'Submitted'
    PLACED = 'Placed', 'Placed'
    UNDER_REVIEW = 'Under Review', 'Under Review'
    INTERVIEW_SCHEDULED = 'Interview Scheduled', 'Interview Scheduled'
    INTERVIEW_COMPLETED = 'Interview Completed', 'Interview Completed'
    OFFER_SENT = 'Offer Sent', 'Offer Sent'
    OFFER_ACCEPTED = 'Offer Accepted', 'Offer Accepted'
    OFFER_REJECTED = 'Offer Rejected', 'Offer Rejected'
    SELECTED = 'Selected', 'Selected'
    REJECTED = 'Rejected', 'Rejected'
    ON_HOLD = 'On Hold', 'On Hold'
    CLOSED = 'Closed', 'Closed'

class Application(models.Model):
    candidate_name = models.CharField(max_length=255, blank=True, default='')
    candidate_email = models.EmailField(blank=True, default='')
    candidate_phone = models.CharField(max_length=50, blank=True, default='')
    client_name = models.CharField(max_length=255)
    city = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    country = models.CharField(max_length=100, blank=True, default='India')
    position = models.CharField(max_length=255)
    technology = models.CharField(max_length=255)
    experience = models.DecimalField(max_digits=4, decimal_places=1)
    recruiter = models.CharField(max_length=255, blank=True, default='')
    assigned_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_applications'
    )
    status = models.CharField(
        max_length=50,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.NEW,
        db_index=True
    )
    remarks = models.TextField(blank=True, default='')
    pan_card = models.CharField(max_length=50, blank=True, default='')
    aadhaar = models.CharField(max_length=50, blank=True, default='')
    alternate_mobile_number = models.CharField(max_length=50, blank=True, default='')
    source = models.CharField(max_length=255, blank=True, default='')
    interest_to_work_for_client = models.CharField(max_length=50, blank=True, default='')
    modified_by = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Career Portal fields (only applicable to job posting records where candidate_name is empty)
    publish_to_career_page = models.BooleanField(default=False)
    publish_to_linkedin = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)

    # AI Match fields
    ai_job_embedding = models.JSONField(null=True, blank=True)
    ai_job_embedding_nemotron = models.JSONField(null=True, blank=True)
    ai_job_embedding_metadata = models.JSONField(null=True, blank=True)

    # AI Match fields (pgvector)
    job_embedding = VectorField(dimensions=2048, null=True, blank=True)
    embedding_model = models.CharField(max_length=100, default='nvidia/nemotron-3-embed-1b')
    embedding_dimension = models.IntegerField(default=2048)
    embedding_version = models.CharField(max_length=50, default='nemotron-v1')
    embedding_generated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.position} - {self.client_name}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None
        old_fields = None
        if not is_new:
            try:
                old_data = Application.objects.values('status', 'position', 'technology', 'remarks').get(pk=self.pk)
                old_status = old_data['status']
                old_fields = old_data
            except Application.DoesNotExist:
                old_status = None
                old_fields = None

        if old_fields:
            if (self.position != old_fields['position'] or
                self.technology != old_fields['technology'] or
                self.remarks != old_fields['remarks']):
                self.ai_job_embedding = None
                self.ai_job_embedding_nemotron = None
                self.ai_job_embedding_metadata = None
                self.job_embedding = None
                self.embedding_generated_at = None

        remarks = self.remarks or ''
        has_placeholder = 'Job Code: PPW - [Auto Generated]' in remarks or 'Job Code: ' not in remarks
        
        # If candidate is assigned to at least one job (non-N/A), auto-transition status to 'Submitted'
        if self.candidate_name and self.client_name and self.client_name != 'N/A' and self.position and self.position != 'N/A':
            if self.status == 'New':
                self.status = 'Submitted'

        super().save(*args, **kwargs)

        # Log status transition note when status changes (or when created with a status)
        if (is_new or (old_status and old_status != self.status)) and self.status:
            note_content = f"Status updated to {self.status}."
            # Check if a Note with exact content already exists for this app to avoid duplicates
            if not Note.objects.filter(application=self, content__startswith=f"Status updated to {self.status}").exists():
                author_user = getattr(self, '_modifying_user', None)
                if not author_user:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    author_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
                if author_user:
                    Note.objects.create(
                        application=self,
                        author=author_user,
                        content=note_content
                    )


        if is_new and has_placeholder:
            job_code = f"PPW - {self.id:04d}"
            if 'Job Code: PPW - [Auto Generated]' in remarks:
                self.remarks = remarks.replace('Job Code: PPW - [Auto Generated]', f'Job Code: {job_code}')
            elif not self.candidate_name and 'Job Code: ' not in remarks:
                if remarks:
                    self.remarks = f"Job Code: {job_code}\n{remarks}"
                else:
                    self.remarks = f"Job Code: {job_code}"
            super().save(update_fields=['remarks'])

class Note(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='notes'
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notes'
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Note by {self.author.full_name} on {self.application.position}"


class CareerPortalApplicant(models.Model):
    job = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='career_portal_applicants'
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    mobile_number = models.CharField(max_length=50)
    alternate_mobile_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField()
    qualification = models.CharField(max_length=255)
    years_of_experience = models.DecimalField(max_digits=4, decimal_places=1)
    expected_pay = models.DecimalField(max_digits=12, decimal_places=2)
    primary_skills = models.TextField()
    current_ctc = models.DecimalField(max_digits=12, decimal_places=2)
    current_company = models.CharField(max_length=255)
    state = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    resume = models.TextField(blank=True, default='')
    accepted_terms = models.BooleanField(default=True)
    source = models.CharField(max_length=100, default='Company Career Portal')
    status = models.CharField(max_length=50, default='New')
    modified_by = models.CharField(max_length=255, blank=True, default='')

    # Import tracking fields
    is_imported = models.BooleanField(default=False, db_index=True)
    imported_at = models.DateTimeField(null=True, blank=True)
    imported_by = models.CharField(max_length=255, blank=True, default='')
    imported_application = models.ForeignKey(
        Application,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='originating_portal_applicant'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # AI Match Shortlisting fields
    ai_match_score = models.FloatField(null=True, blank=True, db_index=True)
    ai_match_score_nemotron = models.FloatField(null=True, blank=True, db_index=True)
    ai_scored_at = models.DateTimeField(null=True, blank=True)

    # Hybrid Component Scores
    score_semantic = models.FloatField(null=True, blank=True)
    score_skills = models.FloatField(null=True, blank=True)
    score_experience = models.FloatField(null=True, blank=True)
    score_title = models.FloatField(null=True, blank=True)
    score_education = models.FloatField(null=True, blank=True)

    # Resume Embeddings (pgvector)
    resume_embedding = VectorField(dimensions=2048, null=True, blank=True)
    resume_content_hash = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    embedding_model = models.CharField(max_length=100, default='nvidia/nemotron-3-embed-1b')
    embedding_dimension = models.IntegerField(default=2048)
    embedding_version = models.CharField(max_length=50, default='nemotron-v1')
    embedding_generated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email}) - Job ID: {self.job_id}"

