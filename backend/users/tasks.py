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
                        <td style="border: 1px solid #cccccc; padding: 10px;"><a href="http://localhost:3000/login" style="color: #0062AD; text-decoration: underline; font-weight: 600;">http://localhost:3000/login</a></td>
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
            f"Login URL  : http://localhost:3000/login\n"
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
