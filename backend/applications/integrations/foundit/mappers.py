"""
Data Mappers for Foundit Integration.
Maps ATS Application models to official Foundit Job Posting API payload structure,
and Foundit candidate application records to CareerPortalApplicant models using documented fields.
"""
import logging

logger = logging.getLogger(__name__)

class FounditJobMapper:
    @staticmethod
    def map_ats_job_to_foundit_payload(job_application, existing_folder_id=0):
        """
        Maps ATS Application model to official Foundit job posting payload.
        Uses documented fields: folderId (0 for new), mapToExistingFolderId (0), status ("save").
        """
        folder_id = int(existing_folder_id) if existing_folder_id else 0

        return {
            "folderId": folder_id,
            "mapToExistingFolderId": 0,
            "status": "save",
            "jobTitle": job_application.position or "",
            "jobDescription": job_application.remarks or "",
            "skills": [s.strip() for s in (job_application.technology or "").split(",") if s.strip()],
            "minExperience": float(job_application.experience or 0),
            "maxExperience": float(job_application.experience or 0) + 3.0,
            "locations": [{
                "city": job_application.city or "",
                "state": job_application.state or "",
                "country": job_application.country or "India"
            }],
            "clientName": job_application.client_name or "People Prime Worldwide"
        }

class FounditCandidateMapper:
    @staticmethod
    def map_foundit_application_to_applicant(application_dict, target_job):
        """
        Maps documented Foundit application response dict to CareerPortalApplicant dict.
        Documented fields: application_id, candidate_name, application_date, application_type,
        profile_details, resume_file_download_url.
        """
        candidate_name = application_dict.get("candidate_name") or "Candidate"
        name_parts = candidate_name.strip().split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        profile = application_dict.get("profile_details") or {}

        email = profile.get("email") or profile.get("email_id") or ""
        phone = profile.get("phone") or profile.get("mobile_number") or ""
        qualification = profile.get("qualification") or profile.get("education") or "Not Specified"
        experience = profile.get("years_of_experience") or profile.get("total_experience") or target_job.experience or 0
        expected_pay = profile.get("expected_salary") or profile.get("expected_pay") or 0
        current_ctc = profile.get("current_salary") or profile.get("current_ctc") or 0
        primary_skills = profile.get("key_skills") or profile.get("primary_skills") or target_job.technology or ""
        current_company = profile.get("current_company") or ""
        city = profile.get("city") or target_job.city or ""
        state = profile.get("state") or target_job.state or ""

        resume_url = application_dict.get("resume_file_download_url") or ""

        return {
            "job": target_job,
            "first_name": first_name.strip(),
            "last_name": last_name.strip(),
            "email": email.strip().lower(),
            "mobile_number": phone.strip(),
            "qualification": str(qualification),
            "years_of_experience": experience,
            "expected_pay": expected_pay,
            "primary_skills": str(primary_skills),
            "current_ctc": current_ctc,
            "current_company": str(current_company),
            "state": str(state),
            "city": str(city),
            "resume": resume_url,
            "source": "Foundit",
            "status": "New",
            "foundit_application_id": str(application_dict.get("application_id") or ""),
            "foundit_candidate_id": str(profile.get("candidate_id") or "")
        }
