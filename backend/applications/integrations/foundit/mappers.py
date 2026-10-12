"""
Data Mappers for Foundit Integration.
Maps ATS Application models to official Foundit Job Posting API payload structure,
and Foundit candidate application records to CareerPortalApplicant models using documented fields.
"""
import os
import re
import logging
from django.utils import timezone
from applications.integrations.foundit.constants import get_foundit_credentials
from applications.integrations.foundit.client import FounditValidationError

logger = logging.getLogger(__name__)

def extract_clean_job_description(remarks):
    if not remarks:
        return ""
    desc = ""
    if "[Skills & Assignment]" in remarks:
        parts = remarks.split("[Skills & Assignment]", 1)
        after = parts[1]
        if "[Notice Period]" in after:
            desc = after.split("[Notice Period]", 1)[0]
        elif "[" in after:
            desc = after.split("[", 1)[0]
        else:
            desc = after
    elif "Description:" in remarks:
        desc = remarks.split("Description:", 1)[1]
    else:
        desc = remarks

    sensitive_key_pattern = re.compile(
        r"^\s*(Client Bill Rate|Pay Rate|Job Code|Start Date|End Date|Location|Job Status|Job Type|Client Job ID|Required Documents|Address|Work Mode|Employee Type|Zip Code|Source Option|FileName):\s*",
        re.IGNORECASE
    )

    cleaned_lines = []
    for line in desc.split("\n"):
        if sensitive_key_pattern.match(line) or re.match(r"^\s*(Degree|Primary Skills):\s*", line, re.IGNORECASE) or line.strip() in ("[Job Details]", "[Skills & Assignment]", "[Notice Period]", "[Document Attachment]"):
            continue
        if re.match(r"^\s*Description:\s*$", line, re.IGNORECASE):
            continue
        line_clean = re.sub(r"^\s*Description:\s*", "", line, flags=re.IGNORECASE) if re.match(r"^\s*Description:\s*\S+", line, re.IGNORECASE) else line
        cleaned_lines.append(line_clean)

    result = "\n".join(cleaned_lines).strip()
    return result if result else remarks.strip()

class FounditJobMapper:
    @staticmethod
    def map_ats_job_to_foundit_payload(job_application, existing_folder_id=0):
        """
        Maps ATS Application model to official Foundit full-time job posting payload
        conforming to 01-ATS-EDGE-JobPosting.pdf specification.
        Enforces contract fields and validates required master data / tenant configurations.
        """
        creds = get_foundit_credentials()

        # 1. Credentials & Identity
        username = (creds.get("username") or "").strip()
        if not username:
            raise FounditValidationError("Validation Error: Missing required Foundit username configuration.")

        password = (creds.get("password") or "").strip()
        if not password:
            raise FounditValidationError("Validation Error: Missing required Foundit password configuration.")

        corp_id_raw = creds.get("corp_id")
        if not corp_id_raw or not str(corp_id_raw).strip():
            raise FounditValidationError("Validation Error: Missing required Foundit corp_id configuration.")
        try:
            corp_id = int(str(corp_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError(f"Validation Error: Invalid Foundit corp_id '{corp_id_raw}'. Must be an integer.")

        recruiter_id_raw = creds.get("recruiter_id")
        if not recruiter_id_raw or not str(recruiter_id_raw).strip():
            raise FounditValidationError("Validation Error: Missing required Foundit recruiter_id configuration.")
        try:
            recruiter_id = int(str(recruiter_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError(f"Validation Error: Invalid Foundit recruiter_id '{recruiter_id_raw}'. Must be an integer.")

        channel_id_raw = creds.get("channel_id") or "1"
        try:
            channel_id = int(str(channel_id_raw).strip())
        except (ValueError, TypeError):
            channel_id = 1

        sub_channel_id = str(creds.get("sub_channel_id") or "1").strip()

        # 2. Company & Owner Details (Mandatory in PDF Pages 2, 4, 8, 13)
        company_name = (creds.get("company_name") or "").strip()
        if not company_name:
            raise FounditValidationError("Validation Error: Missing required Foundit company_name configuration.")

        owner_name = (creds.get("owner_name") or "").strip()
        if not owner_name:
            raise FounditValidationError("Validation Error: Missing required Foundit owner_name configuration. Account ownerName must be confirmed and configured.")

        owner_email = (creds.get("owner_email") or "").strip()
        if not owner_email:
            raise FounditValidationError("Validation Error: Missing required Foundit owner_email configuration. Account ownerEmail must be confirmed and configured.")

        # 3. Location Master Data Mapping (Mandatory in PDF Pages 3, 12-13)
        loc_id_raw = creds.get("location_id") or creds.get("default_location_id")
        loc_name = creds.get("location_name") or creds.get("default_location_name") or job_application.city or ""
        if not loc_id_raw or not str(loc_id_raw).strip():
            raise FounditValidationError(
                f"Validation Error: Missing Foundit locationId configuration for city '{job_application.city}'. "
                "Foundit master data locationId must be confirmed and configured."
            )
        try:
            location_id = int(str(loc_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError(f"Validation Error: Invalid Foundit locationId '{loc_id_raw}'. Must be an integer.")
        location_list = [{"locationId": location_id, "locationName": loc_name or "Hyderabad"}]

        # 4. Industry Master Data Mapping (Mandatory in PDF Pages 3, 9)
        ind_id_raw = creds.get("industry_id") or creds.get("default_industry_id")
        ind_name = creds.get("industry_name") or creds.get("default_industry_name")
        if not ind_id_raw or not ind_name or not str(ind_id_raw).strip():
            raise FounditValidationError(
                "Validation Error: Missing Foundit industryId / industryName configuration. "
                "Foundit master data industry values must be confirmed and configured."
            )
        try:
            industry_id = int(str(ind_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError(f"Validation Error: Invalid Foundit industryId '{ind_id_raw}'. Must be an integer.")
        industry_list = [{"industryId": industry_id, "industryName": str(ind_name).strip()}]

        # 5. Role Master Data Mapping (Mandatory in PDF Pages 4, 13-14)
        role_id_raw = creds.get("role_id") or creds.get("default_role_id")
        role_name = creds.get("role_name") or creds.get("default_role_name")
        func_name = creds.get("function_name") or creds.get("default_function_name") or "IT"
        if not role_id_raw or not role_name or not str(role_id_raw).strip():
            raise FounditValidationError(
                "Validation Error: Missing Foundit roleId / roleName configuration. "
                "Foundit master data role values must be confirmed and configured."
            )
        try:
            role_id = int(str(role_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError(f"Validation Error: Invalid Foundit roleId '{role_id_raw}'. Must be an integer.")
        role_list = [{"roleId": role_id, "roleName": str(role_name).strip(), "functionName": str(func_name).strip()}]

        # 6. Salary Configuration (Mandatory in PDF Pages 3-5, 8, 13-14)
        min_sal_raw = creds.get("min_salary") or creds.get("default_min_salary")
        max_sal_raw = creds.get("max_salary") or creds.get("default_max_salary")
        if min_sal_raw is None or max_sal_raw is None or str(min_sal_raw).strip() == "" or str(max_sal_raw).strip() == "":
            raise FounditValidationError(
                "Validation Error: Missing Foundit salary configuration (min_salary / max_salary). "
                "Contractual salary values must be confirmed and configured."
            )
        try:
            min_salary = int(str(min_sal_raw).strip())
            max_salary = int(str(max_sal_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError("Validation Error: Invalid Foundit salary configuration. Must be integers.")

        curr_id_raw = creds.get("currency_id") or creds.get("default_currency_id") or "1"
        try:
            currency_id = int(str(curr_id_raw).strip())
        except (ValueError, TypeError):
            currency_id = 1
        salary_confidential = str(creds.get("salary_confidential") or creds.get("default_salary_confidential") or "1").strip()

        # 7. Skills List & Priority Mapping (PDF Pages 5, 14-15; skillId: 0 for custom skills)
        skills = [s.strip() for s in (job_application.technology or "").split(",") if s.strip()]
        if not skills:
            skills = [job_application.position.strip()] if job_application.position else ["Software Engineering"]
        skill_list = [{"skillId": 0, "skillName": s} for s in skills]

        priority_skills = [
            {"skillId": s["skillId"], "skillName": s["skillName"], "type": "any"}
            for s in skill_list
        ]
        job_priority = {
            "maxSalaryFilter": 0,
            "minSalaryFilter": 0,
            "salaryFilter": 0,
            "locationFilter": "1",
            "nationalityFilter": "0",
            "educationFilter": "0",
            "experienceFilter": "1",
            "industryFilter": "1",
            "skillFilter": "1",
            "useKeySkillsSynonm": "1",
            "location_list_priority": location_list,
            "industry_list_priority": industry_list,
            "nationality_list_priority": [],
            "ignoredSkills": [],
            "prioritySkills": priority_skills
        }

        # 8. Core Posting Identifiers & Metadata
        folder_id = int(existing_folder_id) if existing_folder_id else 0
        base_url = (os.getenv("PUBLIC_CAREER_PORTAL_URL") or "https://people-prime.com").rstrip("/")
        apply_url = f"{base_url}/job-details?id={job_application.id}&src=Foundit"
        clean_desc = extract_clean_job_description(job_application.remarks or "")
        start_date = timezone.now().strftime("%Y-%m-%d")

        min_exp = int(float(job_application.experience or 0))
        max_exp = int(float(job_application.experience or 0)) + 3

        return {
            "userName": username,
            "password": password,
            "corpId": corp_id,
            "recruiterId": recruiter_id,
            "channelId": channel_id,
            "subChannelId": sub_channel_id,
            "folderId": folder_id,
            "mapToExistingFolderId": 0,
            "status": "save",
            "jobPostingType": "JP",
            "jobType": "fulltime",
            "siteContext": "rexmonster",
            "companyName": company_name,
            "ownerName": owner_name,
            "ownerEmail": owner_email,
            "startDate": start_date,
            "title": job_application.position or "",
            "description": clean_desc,
            "applyUrl": apply_url,
            "applicationsViaMail": "0",
            "autoRenew": "0",
            "minExperience": min_exp,
            "maxExperience": max_exp,
            "minSalary": min_salary,
            "maxSalary": max_salary,
            "currencyId": currency_id,
            "salaryConfidential": salary_confidential,
            "skillList": skill_list,
            "locationList": location_list,
            "industryList": industry_list,
            "roleList": role_list,
            "job_priority": job_priority,
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

        profile = application_dict.get("profile_details")
        if not isinstance(profile, dict):
            profile = {}

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
