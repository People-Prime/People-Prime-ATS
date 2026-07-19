from django.db import models
from django.conf import settings

class ApplicationStatus(models.TextChoices):
    NEW = 'New', 'New'
    SUBMITTED = 'Submitted', 'Submitted'
    PLACED = 'Placed', 'Placed'
    UNDER_REVIEW = 'Under Review', 'Under Review'
    INTERVIEW_SCHEDULED = 'Interview Scheduled', 'Interview Scheduled'
    INTERVIEW_COMPLETED = 'Interview Completed', 'Interview Completed'
    OFFER_SENT = 'Offer Sent', 'Offer Sent'
    OFFER_ACCEPTED = 'Offer Accepted', 'Offer Accepted'
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.position} - {self.client_name}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        remarks = self.remarks or ''
        has_placeholder = 'Job Code: PPW - [Auto Generated]' in remarks or 'Job Code: ' not in remarks
        
        # If candidate is assigned to at least one job (non-N/A), auto-transition status to 'Submitted'
        if self.candidate_name and self.client_name and self.client_name != 'N/A' and self.position and self.position != 'N/A':
            if self.status == 'New':
                self.status = 'Submitted'

        super().save(*args, **kwargs)
        
        if is_new and not self.candidate_name and has_placeholder:
            job_code = f"PPW - {self.id:04d}"
            if 'Job Code: PPW - [Auto Generated]' in remarks:
                self.remarks = remarks.replace('Job Code: PPW - [Auto Generated]', f'Job Code: {job_code}')
            elif 'Job Code: ' not in remarks:
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
