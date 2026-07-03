from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

@shared_task
def send_welcome_email_task(email, full_name, password):
    logger.info(f"[CELERY] Sending welcome email to {email}")
    try:
        # Beautiful HTML template with table formatting
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; padding: 15px;">
            <p style="font-size: 1rem; margin-bottom: 10px;">Hello <strong>{full_name}</strong>,</p>
            <p style="margin-bottom: 20px;">Your employee account has been successfully created by the administrator.</p>
            
            <h3 style="color: #0062AD; margin-bottom: 10px; border-bottom: 2px solid #0062AD; padding-bottom: 5px; max-width: 450px;">Your Login Credentials</h3>
            <table style="border-collapse: collapse; width: 100%; max-width: 450px; font-size: 0.9rem; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <thead>
                    <tr style="background-color: #0062AD; color: #ffffff;">
                        <th style="border: 1px solid #cccccc; text-align: left; padding: 10px; font-weight: 700; width: 30%;">Field</th>
                        <th style="border: 1px solid #cccccc; text-align: left; padding: 10px; font-weight: 700;">Details</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold; background-color: #f9f9f9;">Login URL</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;"><a href="https://ats.people-prime.com/login" style="color: #0062AD; text-decoration: underline; font-weight: 600;">https://ats.people-prime.com/login</a></td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold; background-color: #f9f9f9;">Email</td>
                        <td style="border: 1px solid #cccccc; padding: 10px; color: #555555;">{email}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold; background-color: #f9f9f9;">Password</td>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-family: Courier, monospace; font-size: 1rem; color: #e11d48; font-weight: 700;">{password}</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="font-size: 0.85rem; color: #666666; margin-top: 15px;">
                <em>* For security reasons, you will be prompted to change your password immediately upon first login.</em>
            </p>
            <br/>
            <p style="margin-top: 20px; font-size: 0.95rem;">
                Best regards,<br/>
                <strong>People Prime ATS Team</strong>
            </p>
        </body>
        </html>
        """

        text_content = (
            f"Hello {full_name},\n\n"
            f"Your employee account has been created by the administrator.\n\n"
            f"--- Your Login Credentials ---\n"
            f"Login URL  : https://ats.people-prime.com/login\n"
            f"Email      : {email}\n"
            f"Password   : {password}\n\n"
            f"For security, you will be prompted to change your password on first login.\n\n"
            f"Best regards,\nPeople Prime ATS Team"
        )

        send_mail(
            'Welcome to People Prime ATS — Your Account is Ready!',
            text_content,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
            html_message=html_content
        )
        logger.info(f"[CELERY] Welcome email sent successfully to {email}")
        return True
    except Exception as e:
        logger.error(f"[CELERY] Failed to send welcome email to {email}: {e}")
        raise e


@shared_task
def send_job_assignment_email_task(associate_email, associate_name, lead_email, lead_name, job_details, associate_emails=None):
    """
    Send a job assignment notification email.
    
    associate_emails: list of dicts [{'email': ..., 'name': ...}, ...] for bulk send.
                      If provided, overrides associate_email/associate_name.
    associate_email:  single email (legacy / fallback).
    """
    # Build recipient list
    if associate_emails:
        recipients = associate_emails  # list of {'email': ..., 'name': ...}
    else:
        recipients = [{'email': associate_email, 'name': associate_name}]

    to_emails = [r['email'] for r in recipients]
    logger.info(f"[CELERY] Sending job assignment email to {to_emails} from {lead_name}")
    try:
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; padding: 15px;">
            <h2 style="color: #0062AD; border-bottom: 2px solid #0062AD; padding-bottom: 10px; max-width: 600px;">New Job Posting Notification</h2>
            <p style="font-size: 1rem;">Dear Team,</p>
            <p style="font-size: 0.95rem;">A new job has been posted and assigned to you. Please find the job details and click on the link provided below to view the complete job details.</p>
            
            <table style="border-collapse: collapse; width: 100%; max-width: 600px; font-size: 0.9rem; margin-top: 15px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <tbody>
                    <tr style="background-color: #f9f9f9;">
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold; width: 25%;">Job Code</td>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: 700; color: #0062AD;">{job_details.get('job_code', 'N/A')}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Job Title</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('job_title', 'N/A')}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Client Job ID</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('client_job_id', 'N/A')}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Location</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('location', 'N/A')}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Duration</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('duration', 'N/A')}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Priority</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('priority', 'N/A')}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">Primary Skills</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('primary_skills', 'N/A')}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;"># Of Positions</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;">{job_details.get('positions', '1')}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="border: 1px solid #cccccc; padding: 10px; font-weight: bold;">View Details</td>
                        <td style="border: 1px solid #cccccc; padding: 10px;"><a href="https://ats.people-prime.com/" style="color: #0062AD; text-decoration: underline; font-weight: 600;">Click Here to View Job</a></td>
                    </tr>
                </tbody>
            </table>
            
            <h4 style="color: #0062AD; margin-bottom: 5px;">Job Description</h4>
            <div style="background-color: #f5f5f5; border-left: 4px solid #0062AD; padding: 15px; font-size: 0.9rem; max-width: 600px; white-space: pre-wrap; margin-bottom: 25px;">{job_details.get('description', 'N/A')}</div>
            
            <p style="margin-top: 20px; font-size: 0.95rem;">
                Best regards,<br/>
                <strong>{lead_name}</strong><br/>
                <span style="color: #666666; font-size: 0.85rem;">Team Lead, People Prime Worldwide</span>
            </p>
        </body>
        </html>
        """

        text_content = f"""New Job Posting Notification
Dear Team,
A new job has been posted and assigned to the team. Please find the job details and click on the link provided below to view the complete job details.

Job Code: {job_details.get('job_code', 'N/A')}
Job Title: {job_details.get('job_title', 'N/A')}
Client Job ID: {job_details.get('client_job_id', 'N/A')}
Location: {job_details.get('location', 'N/A')}
Duration: {job_details.get('duration', 'N/A')}
Priority: {job_details.get('priority', 'N/A')}
Primary Skills: {job_details.get('primary_skills', 'N/A')}
# Of Positions: {job_details.get('positions', '1')}

View Link: https://ats.people-prime.com/

Job Description:
{job_details.get('description', 'N/A')}

Best regards,
{lead_name}
Team Lead, People Prime Worldwide
"""

        from django.core.mail import EmailMultiAlternatives
        from_email_header = f"{lead_name} via People Prime ATS <{settings.DEFAULT_FROM_EMAIL}>"
        
        email_msg = EmailMultiAlternatives(
            subject=f"New Job Assignment: {job_details.get('job_code', 'N/A')} - {job_details.get('job_title', 'Job Opening')}",
            body=text_content,
            from_email=from_email_header,
            to=to_emails,
            reply_to=[lead_email]
        )
        email_msg.attach_alternative(html_content, "text/html")
        email_msg.send(fail_silently=False)
        
        logger.info(f"[CELERY] Job assignment email sent successfully to {to_emails}")
        return True
    except Exception as e:
        logger.error(f"[CELERY] Failed to send job assignment email to {to_emails}: {e}")
        raise e

