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

VERIFIED_FOUNDIT_LOCATIONS = {
    # Top Metros & ATS Hiring Hubs (Official Foundit Master Data)
    "hyderabad": {"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"},
    "secunderabad": {"locationId": 6, "locationName": "Hyderabad / Secunderabad, Telangana"},
    "bangalore": {"locationId": 2, "locationName": "Bengaluru / Bangalore"},
    "bengaluru": {"locationId": 2, "locationName": "Bengaluru / Bangalore"},
    "pune": {"locationId": 10, "locationName": "Pune"},
    "chennai": {"locationId": 3, "locationName": "Chennai"},
    "mumbai": {"locationId": 8, "locationName": "Mumbai"},
    "mumbai city": {"locationId": 491, "locationName": "Mumbai City"},
    "navi mumbai": {"locationId": 492, "locationName": "Navi Mumbai"},
    "thane": {"locationId": 493, "locationName": "Thane"},
    "noida": {"locationId": 9, "locationName": "Noida"},
    "gurgaon": {"locationId": 5, "locationName": "Gurgaon / Gurugram"},
    "gurugram": {"locationId": 5, "locationName": "Gurgaon / Gurugram"},
    "delhi": {"locationId": 4, "locationName": "Delhi"},
    "delhi ncr": {"locationId": 199, "locationName": "Delhi NCR"},
    "ncr": {"locationId": 199, "locationName": "Delhi NCR"},
    "ahmedabad": {"locationId": 1, "locationName": "Ahmedabad"},
    "kolkata": {"locationId": 7, "locationName": "Kolkata"},
    "chandigarh": {"locationId": 40, "locationName": "Chandigarh"},
    "mohali": {"locationId": 103, "locationName": "Mohali"},
    "coimbatore": {"locationId": 41, "locationName": "Coimbatore"},
    "kochi": {"locationId": 87, "locationName": "Cochin / Kochi / Ernakulam"},
    "cochin": {"locationId": 87, "locationName": "Cochin / Kochi / Ernakulam"},
    "ernakulam": {"locationId": 51, "locationName": "Ernakulam"},
    "indore": {"locationId": 69, "locationName": "Indore"},
    "jaipur": {"locationId": 72, "locationName": "Jaipur"},
    "visakhapatnam": {"locationId": 154, "locationName": "Visakhapatnam"},
    "vizag": {"locationId": 154, "locationName": "Visakhapatnam"},
    "vijayawada": {"locationId": 153, "locationName": "Vijayawada"},
    "trivandrum": {"locationId": 143, "locationName": "Thiruvananthapuram / Trivandrum"},
    "thiruvananthapuram": {"locationId": 143, "locationName": "Thiruvananthapuram / Trivandrum"},
    "nagpur": {"locationId": 107, "locationName": "Nagpur"},
    "bhopal": {"locationId": 33, "locationName": "Bhopal"},
    "lucknow": {"locationId": 97, "locationName": "Lucknow"},
    "surat": {"locationId": 138, "locationName": "Surat"},
    "vadodara": {"locationId": 26, "locationName": "Vadodara"},
    "baroda": {"locationId": 26, "locationName": "Vadodara"},
    "mysore": {"locationId": 105, "locationName": "Mysore"},
    "mysuru": {"locationId": 105, "locationName": "Mysore"},
}

# Canonical skill dictionary mapping normalized lower-case keys to clean display names
CANONICAL_SKILL_NAMES = {
    "c#": "C#",
    ".net": ".NET",
    "dotnet": ".NET",
    "oracle": "Oracle",
    "pl/sql": "PL/SQL",
    "plsql": "PL/SQL",
    "angular": "Angular",
    "react": "React",
    "python": "Python",
    "java": "Java",
    "spring": "Spring",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "sql": "SQL",
    "postgresql": "PostgreSQL",
    "apis": "APIs",
    "api": "APIs",
    "restful apis": "RESTful APIs",
    "integration": "Integration",
    "fortigate": "FortiGate",
    "forticonverter": "FortiConverter",
    "fortimanager": "FortiManager",
    "fortianalyzer": "FortiAnalyzer",
    "fortinet": "Fortinet",
    "ansible": "Ansible",
    "cisco": "Cisco",
    "palo alto": "Palo Alto",
    "check point": "Check Point",
    "firewall": "Firewall",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "linux": "Linux",
    "terraform": "Terraform",
    "kafka": "Kafka",
    "redis": "Redis",
    "snowflake": "Snowflake",
    "spark": "Spark",
    "hadoop": "Hadoop",
    "django": "Django",
    "fastapi": "FastAPI",
    "selenium": "Selenium",
    "jmeter": "JMeter",
    "go": "Go",
    "postgres": "PostgreSQL",
    "celery": "Celery",
}

def extract_job_skills(job_application):
    """
    Extracts, normalizes, and deduplicates relevant skills for an ATS job application:
    1. Identifies optional/preferred skills in remarks (e.g. 'Python is a plus') to avoid
       marking them as mandatory in Foundit's skillList.
    2. Combines skills from structured job_application.technology and matched technical terms in remarks.
    3. Normalizes and deduplicates skills case-insensitively using canonical taxonomy names.
    4. Rejects generic words or job title fallback; raises FounditValidationError if no skills exist.
    """
    remarks = job_application.remarks or ""
    pos = (job_application.position or "").strip()
    tech = (job_application.technology or "").strip()

    skills = []
    seen = set()

    # 1. Identify optional/preferred skills in remarks (e.g. 'Python is a plus', 'optional', 'preferred')
    optional_skills = set()
    for k in CANONICAL_SKILL_NAMES:
        esc = re.escape(k) if not k.startswith('.') else re.escape(k)
        patterns = [
            rf'\b{esc}\b\s+is\s+(?:a\s+)?plus\b',
            rf'\b{esc}\b\s+is\s+(?:preferred|optional|an\s+advantage)\b',
            rf'\b{esc}\b\s*\((?:plus|preferred|optional)\)',
            rf'\b(?:preferred|optional|plus|nice\s+to\s+have|good\s+to\s+have)\s*:\s*.*?\b{esc}\b',
            rf'\b(?:knowledge|experience)\s+(?:of|with|in)\s+{esc}\s+is\s+(?:a\s+)?(?:plus|preferred|optional|advantage)\b',
            rf'\b{esc}\s+(?:knowledge|experience)\s+is\s+(?:a\s+)?(?:plus|preferred|optional|advantage)\b',
            rf'\bplus\s+{esc}\b',
        ]
        if re.search('|'.join(patterns), remarks, re.IGNORECASE):
            optional_skills.add(k)

    def add_skill(s):
        s_clean = s.strip().strip("-*•●\t ")
        if not s_clean or len(s_clean) < 2:
            return
        s_lower = s_clean.lower()
        if s_lower in optional_skills:
            logger.info(f"[FounditJobMapper] Skill '{s_clean}' identified as optional/preferred; excluded from mandatory skillList.")
            return
        canonical_name = CANONICAL_SKILL_NAMES.get(s_lower, s_clean)
        canonical_lower = canonical_name.lower()
        if canonical_lower not in seen and canonical_lower != pos.lower():
            seen.add(canonical_lower)
            skills.append(canonical_name)

    # 2. Extract from explicit skill sections in remarks
    header_patterns = [
        r'Technical Proficiency:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Primary Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Mandatory Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Key Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Technical Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Required Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
        r'Skills\s*:\s*(.*?)(?=\n\s*(?:\[|[A-Z][A-Za-z &]+:|$))',
    ]
    for pat in header_patterns:
        m = re.search(pat, remarks, re.DOTALL | re.IGNORECASE)
        if m:
            content = m.group(1).strip()
            for part in re.split(r'[,;|\u2022\u25cf/\n]+', content):
                part = part.strip()
                if part and not re.match(r'^(Degree|Location|Client|Job|Start|End|Work|Pay|Notice|Required|Experience)', part, re.IGNORECASE):
                    add_skill(part)

    # 3. Combine with structured job.technology
    if tech and tech.lower() != pos.lower():
        for s in re.split(r'[,;/|\n]+', tech):
            add_skill(s)

    # 4. Scan description for recognized technical tools/technologies (combining with technology)
    if remarks:
        for term, canonical_name in CANONICAL_SKILL_NAMES.items():
            if term == 'sql':
                pattern = r'(?<!pl/)(?<![A-Za-z0-9])sql(?![A-Za-z0-9])'
            elif term.startswith('.'):
                pattern = re.escape(term) + r'(?![A-Za-z0-9])'
            else:
                pattern = r'(?<![A-Za-z0-9])' + re.escape(term) + r'(?![A-Za-z0-9])'
            if re.search(pattern, remarks, re.IGNORECASE):
                add_skill(canonical_name)

    # 5. Strict rejection: Do not fall back to job title
    if not skills:
        raise FounditValidationError(
            f"Validation Error: No valid technical skills identified for job {job_application.id}. "
            "Foundit requires at least one verified required technical skill."
        )

    return skills

def extract_job_experience(job_application):
    """
    Extracts minExperience and maxExperience without arbitrary '+ 3' offsets:
    1. Uses structured job_application.experience as baseline minimum if present.
    2. Parses explicit range from remarks/description (e.g. 'Experience: 7-12' or '5 to 8 years').
    3. Handles hyphens (-), en dashes (–), em dashes (—), and 'to'.
    4. Validates that maxExperience >= minExperience.
    5. If only a minimum is provided (e.g. '5+ years') and no upper bound exists,
       raises FounditValidationError because Foundit mandates both minExperience and maxExperience.
    """
    remarks = job_application.remarks or ""
    structured_raw = job_application.experience
    structured_min = None
    if structured_raw is not None and str(structured_raw).strip() != "":
        try:
            structured_min = int(float(str(structured_raw).strip()))
        except (ValueError, TypeError):
            pass

    # Look for explicit range in remarks/description
    range_patterns = [
        r'(?:Total\s+)?Experience\s*(?:Required)?\s*:\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)',
        r'\b(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b(?:\s*(?:of\s*)?experience)?',
    ]
    parsed_min = None
    parsed_max = None
    for pat in range_patterns:
        m = re.search(pat, remarks, re.IGNORECASE)
        if m:
            try:
                parsed_min = int(float(m.group(1)))
                parsed_max = int(float(m.group(2)))
                break
            except (ValueError, TypeError):
                continue

    if parsed_min is not None and parsed_max is not None:
        if parsed_max < parsed_min:
            raise FounditValidationError(
                f"Validation Error: Invalid experience range for job {job_application.id} "
                f"(maximum experience {parsed_max} is less than minimum experience {parsed_min})."
            )
        min_exp = parsed_min if parsed_min is not None else structured_min
        max_exp = parsed_max
        if max_exp < min_exp:
            raise FounditValidationError(
                f"Validation Error: Invalid experience range for job {job_application.id} "
                f"(maximum experience {max_exp} is less than minimum experience {min_exp})."
            )
        return min_exp, max_exp

    # Single minimum without established upper bound
    min_candidate = structured_min
    if min_candidate is None:
        m_single = re.search(r'\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b(?:\s*(?:of\s*)?experience)?', remarks, re.IGNORECASE)
        if m_single:
            try:
                min_candidate = int(float(m_single.group(1)))
            except (ValueError, TypeError):
                pass

    if min_candidate is not None:
        raise FounditValidationError(
            f"Validation Error: Foundit requires both minExperience and maxExperience. "
            f"ATS job {job_application.id} defines minimum experience ({min_candidate} years) "
            "but lacks an established maximum experience range (e.g. '5-8 years'). "
            "An explicit maximum experience must be provided to post to Foundit without arbitrary assumptions."
        )

    raise FounditValidationError(
        f"Validation Error: Missing experience requirements for job {job_application.id}. "
        "Foundit requires valid minExperience and maxExperience."
    )

def extract_job_salary(job_application, creds):
    """
    Extracts minSalary and maxSalary in accordance with client-approved job budget semantics:
    1. Treats Pay Rate / Salary as the client-approved compensation budget for the job opening,
       not the final salary negotiated with an individual candidate.
    2. NEVER uses Client Bill Rate as candidate salary or job budget.
    3. NEVER substitutes an individual candidate's actual salary for the advertised job budget.
    4. Supports explicitly annual budgets (LPA/Lacs ranges and amounts, INR integer ranges, per annum rates).
    5. Rejects unsupported/foreign currencies (e.g. USD, EUR) requiring explicit INR budget confirmation.
    6. Rejects monthly or hourly budgets without established business conversion rules, requiring confirmation.
    7. Rejects ambiguous single values or rates lacking verified annual period.
    8. Preserves experienced role safeguards against low fallback salary defaults.
    """
    remarks = job_application.remarks or ""

    # Ensure advertised job budget keywords do not match candidate-specific compensation
    # (e.g. 'Current CTC', 'Expected CTC', 'Candidate CTC', 'Negotiated Salary', 'Offered Salary')
    BUDGET_KEYWORD = (
        r'(?<!\bCurrent\s)(?<!\bExpected\s)(?<!\bCandidate\s)(?<!\bNegotiated\s)(?<!\bOffered\s)'
        r'(?:Client\s*Budget|Pay\s*Rate(?:\s*/\s*Salary)?|Budget|Annual\s*(?:Salary|Pay|CTC)|\bCTC\b|\bSalary\b)'
    )

    # Check 0: Explicit Metadata from remarks (Salary Currency, Salary Period, Budget Confirmation)
    period_match = re.search(r'(?:Salary\s*Period|Budget\s*Period|Pay\s*Period)\s*:\s*([^\r\n]*)', remarks, re.IGNORECASE)
    explicit_period = period_match.group(1).strip() if period_match else ""

    currency_match = re.search(r'(?:Salary\s*Currency|Budget\s*Currency|Currency)\s*:\s*([^\r\n]*)', remarks, re.IGNORECASE)
    explicit_currency = currency_match.group(1).strip() if currency_match else ""

    confirm_match = re.search(r'(?:Client\s*Budget\s*Confirmed|Budget\s*Confirmed)\s*:\s*([^\r\n]*)', remarks, re.IGNORECASE)
    explicit_confirmation = confirm_match.group(1).strip() if confirm_match else ""
    is_budget_confirmed = (
        explicit_confirmation.lower() in ["yes", "true", "confirmed", "1"] or
        bool(getattr(job_application, 'client_budget_confirmed', False))
    )

    # Check 1: Foreign or unsupported currency
    if explicit_currency and explicit_currency.upper() not in ["INR", "RS", "RS.", "₹", ""]:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            f"specifies an unsupported or foreign currency ({explicit_currency}). Foundit requires compensation in INR (currencyId: 1). "
            "Confirm the client-approved budget in INR before publishing."
        )

    foreign_curr_match = re.search(
        rf'{BUDGET_KEYWORD}\s*:\s*(?:[\$€£]|[^\r\n]*?\b(?:USD|EUR|GBP)\b)',
        remarks,
        re.IGNORECASE
    )
    if foreign_curr_match:
        matched_text = foreign_curr_match.group(0)
        curr_str = "foreign/unsupported"
        for c in ["USD", "EUR", "GBP", "$", "€", "£"]:
            if c.lower() in matched_text.lower():
                curr_str = c
                break
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            f"specifies an unsupported or foreign currency ({curr_str}). Foundit requires compensation in INR (currencyId: 1). "
            "Confirm the client-approved budget in INR before publishing."
        )

    # Check 2: Explicit Monthly or Hourly pay period without approved conversion rules
    is_monthly = bool(
        (explicit_period and explicit_period.lower() in ["per month", "monthly", "month", "pm"]) or
        re.search(rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:per\s*month|p\.?m\.?|/\s*month|monthly)', remarks, re.IGNORECASE)
    )
    if is_monthly:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            "specifies a monthly pay period. Foundit full-time job postings require an approved annual budget. "
            "Confirm the client-approved annual budget range (e.g. annual CTC in LPA or INR) before publishing. "
            "Client Bill Rate cannot be used as candidate salary."
        )

    is_hourly = bool(
        (explicit_period and explicit_period.lower() in ["per hour", "hourly", "hour", "ph", "hr"]) or
        re.search(rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:per\s*hour|p\.?h\.?|/\s*hr|/\s*hour|hourly)', remarks, re.IGNORECASE)
    )
    if is_hourly:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            "specifies an hourly pay period. Foundit full-time job postings require an approved annual budget. "
            "Confirm the client-approved annual budget range (e.g. annual CTC in LPA or INR) before publishing. "
            "Client Bill Rate cannot be used as candidate salary."
        )

    if explicit_period and explicit_period.lower() in ["unknown", "none", "n/a"]:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            "specifies an unknown or unconfirmed pay period. Confirm the client-approved budget period (Per Annum) before publishing. "
            "Client Bill Rate cannot be used as candidate salary."
        )

    is_confirmed_annual = bool(
        explicit_period and explicit_period.lower() in ["per annum", "annual", "yearly", "pa", "p.a.", "per year"]
    )

    # Check 3: Explicit Annual Ranges
    # A. Explicit LPA range (e.g. 'CTC: 20-30 LPA', 'Budget: 12-18 LPA', 'Pay Rate: 15-20 Lakhs per annum')
    lpa_range_match = re.search(
        rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:LPA|Lakhs?|Lacs?)(?:\s*(?:per annum|PA|p\.a\.|annual))?',
        remarks,
        re.IGNORECASE
    )
    if lpa_range_match:
        try:
            s_min = int(float(lpa_range_match.group(1)) * 100000)
            s_max = int(float(lpa_range_match.group(2)) * 100000)
            if s_min > s_max:
                s_min, s_max = s_max, s_min
            return s_min, s_max
        except (ValueError, TypeError):
            pass

    # B. Explicit integer range with explicit annual unit or standard CTC range
    annual_range_match = re.search(
        rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)\s*(?:-|–|—|to)\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)\s*(?:per annum|PA|p\.a\.|annual|year)',
        remarks,
        re.IGNORECASE
    )
    if annual_range_match:
        try:
            s_min = int(annual_range_match.group(1).replace(",", ""))
            s_max = int(annual_range_match.group(2).replace(",", ""))
            if s_min > s_max:
                s_min, s_max = s_max, s_min
            return s_min, s_max
        except (ValueError, TypeError):
            pass

    # C. Integer range when budget period is explicitly confirmed as Per Annum
    if is_confirmed_annual:
        annual_confirmed_range = re.search(
            rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)\s*(?:-|–|—|to)\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)',
            remarks,
            re.IGNORECASE
        )
        if annual_confirmed_range:
            if not is_budget_confirmed:
                raise FounditValidationError(
                    f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
                    "requires explicit recruiter confirmation. The selected period must reflect the actual client-approved budget. "
                    "Client Bill Rate cannot be used as candidate salary."
                )
            try:
                s_min = int(annual_confirmed_range.group(1).replace(",", ""))
                s_max = int(annual_confirmed_range.group(2).replace(",", ""))
                if s_min > s_max:
                    s_min, s_max = s_max, s_min
                return s_min, s_max
            except (ValueError, TypeError):
                pass

    ctc_range_match = re.search(
        r'(?<!\bCurrent\s)(?<!\bExpected\s)(?<!\bCandidate\s)(?<!\bNegotiated\s)(?<!\bOffered\s)(?:CTC|Annual\s*(?:Salary|Pay|CTC))\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)\s*(?:-|–|—|to)\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)(?!\s*(?:LPA|Lakhs?|Lacs?))',
        remarks,
        re.IGNORECASE
    )
    if ctc_range_match:
        try:
            s_min = int(ctc_range_match.group(1).replace(",", ""))
            s_max = int(ctc_range_match.group(2).replace(",", ""))
            if s_min > s_max:
                s_min, s_max = s_max, s_min
            return s_min, s_max
        except (ValueError, TypeError):
            pass

    # Check 4: Explicit Single Annual Amounts
    # A. Single LPA amount (e.g. 'CTC: 15 LPA', 'Pay Rate: 15 LPA', 'Budget: 18 Lakhs per annum')
    lpa_single_match = re.search(
        rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:LPA|Lakhs?|Lacs?)(?:\s*(?:per annum|PA|p\.a\.|annual))?',
        remarks,
        re.IGNORECASE
    )
    if lpa_single_match:
        try:
            s_val = int(float(lpa_single_match.group(1)) * 100000)
            return s_val, s_val
        except (ValueError, TypeError):
            pass

    # B. Single full integer with explicit annual keyword
    single_annual_match = re.search(
        rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)\s*(?:per annum|PA|p\.a\.|annual|year)',
        remarks,
        re.IGNORECASE
    )
    if single_annual_match:
        try:
            s_val = int(single_annual_match.group(1).replace(",", ""))
            return s_val, s_val
        except (ValueError, TypeError):
            pass

    # C. Single full integer when budget period is explicitly confirmed as Per Annum
    if is_confirmed_annual:
        annual_confirmed_single = re.search(
            rf'{BUDGET_KEYWORD}\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)',
            remarks,
            re.IGNORECASE
        )
        if annual_confirmed_single:
            if not is_budget_confirmed:
                raise FounditValidationError(
                    f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
                    "requires explicit recruiter confirmation. The selected period must reflect the actual client-approved budget. "
                    "Client Bill Rate cannot be used as candidate salary."
                )
            try:
                s_val = int(annual_confirmed_single.group(1).replace(",", ""))
                return s_val, s_val
            except (ValueError, TypeError):
                pass

    # D. Single explicit CTC integer
    single_ctc_match = re.search(
        r'(?<!\bCurrent\s)(?<!\bExpected\s)(?<!\bCandidate\s)(?<!\bNegotiated\s)(?<!\bOffered\s)(?:CTC|Annual\s*(?:Salary|Pay|CTC))\s*:\s*(?:INR|Rs\.?|₹)?\s*(\d+(?:,\d+)*)',
        remarks,
        re.IGNORECASE
    )
    if single_ctc_match:
        try:
            s_val = int(single_ctc_match.group(1).replace(",", ""))
            return s_val, s_val
        except (ValueError, TypeError):
            pass

    # Check 5: Check for Pay Rate, Budget, Salary without verified annual unit, or presence of Client Bill Rate
    has_pay_rate = bool(re.search(rf'{BUDGET_KEYWORD}\s*:\s*(\d+)', remarks, re.IGNORECASE))
    has_bill_rate = bool(re.search(r'Client Bill Rate:\s*(\d+)', remarks, re.IGNORECASE))

    if has_pay_rate or has_bill_rate:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: the client-approved job budget for job {job_application.id} "
            "could not be interpreted reliably. Ambiguous salary unit: confirm the budget amount or range, currency, and pay period "
            "(e.g., annual CTC in LPA or INR). Client Bill Rate cannot be used as candidate salary."
        )

    has_candidate_salary = bool(re.search(
        r'\b(?:Current|Expected|Candidate|Negotiated|Offered)\s*(?:CTC|Salary|Pay)\b',
        remarks,
        re.IGNORECASE
    ))
    if has_candidate_salary:
        raise FounditValidationError(
            f"Validation Error: Foundit publication blocked: ATS job {job_application.id} contains candidate-specific compensation "
            "details but lacks a confirmed client-approved job budget. "
            "Candidate-specific salary cannot be used as candidate salary or fallback for the job budget."
        )

    # Check 6: Fallback to configured environment defaults (only if record has no salary/budget specified at all)
    min_sal_raw = creds.get("min_salary") or creds.get("default_min_salary")
    max_sal_raw = creds.get("max_salary") or creds.get("default_max_salary")
    if min_sal_raw and max_sal_raw and str(min_sal_raw).strip() and str(max_sal_raw).strip():
        try:
            min_sal = int(str(min_sal_raw).strip())
            max_sal = int(str(max_sal_raw).strip())
            if min_sal > max_sal:
                min_sal, max_sal = max_sal, min_sal

            # Prevent missing compensation on experienced positions from silently posting misleading salary defaults (e.g. 1.0 - 2.5 LPA)
            structured_exp = job_application.experience
            if structured_exp is not None:
                try:
                    exp_val = float(str(structured_exp).strip())
                    if exp_val >= 2.0 and max_sal <= 300000:
                        raise FounditValidationError(
                            f"Validation Error: ATS job {job_application.id} has no client-approved budget in remarks. "
                            f"Configured fallback salary defaults ({min_sal}-{max_sal}) cannot be silently substituted because "
                            f"they would misrepresent compensation for an experienced role ({exp_val} years experience). "
                            "Explicit client-approved job budget must be provided in the ATS job record before posting."
                        )
                except (ValueError, TypeError) as e:
                    if isinstance(e, FounditValidationError):
                        raise e

            return min_sal, max_sal
        except (ValueError, TypeError):
            raise FounditValidationError("Validation Error: Invalid Foundit salary configuration. Must be integers.")

    raise FounditValidationError(
        f"Validation Error: Missing Foundit salary configuration for job {job_application.id}. "
        "Neither ATS job record provides an explicit client-approved budget nor do environment settings provide valid salary bounds."
    )

def resolve_job_location(job_application, creds):
    """
    Resolves locationId and locationName for a job application:
    1. Checks verified official locations (Bangalore -> 2, Ahmedabad -> 1).
    2. Checks if configured default_location_name matches job_application.city.
    3. Raises FounditValidationError if location is unconfirmed, avoiding silent misrouting.
    """
    city_clean = (job_application.city or "").strip().lower()

    # 1. Verified official locations from 01-ATS-EDGE-JobPosting.pdf
    if city_clean in VERIFIED_FOUNDIT_LOCATIONS:
        loc = VERIFIED_FOUNDIT_LOCATIONS[city_clean]
        return [{"locationId": loc["locationId"], "locationName": loc["locationName"]}]

    # 2. Check if environment configuration matches this specific city
    configured_loc_name = (creds.get("location_name") or creds.get("default_location_name") or "").strip()
    configured_loc_id = creds.get("location_id") or creds.get("default_location_id")

    if configured_loc_name and configured_loc_id:
        if city_clean == configured_loc_name.lower() or configured_loc_name.lower() in city_clean or city_clean in configured_loc_name.lower():
            try:
                loc_id = int(str(configured_loc_id).strip())
                return [{"locationId": loc_id, "locationName": configured_loc_name}]
            except (ValueError, TypeError):
                raise FounditValidationError(f"Validation Error: Invalid Foundit locationId '{configured_loc_id}'. Must be an integer.")

    # 3. Unresolved location
    raise FounditValidationError(
        f"Validation Error: Missing or unconfirmed Foundit locationId for city '{job_application.city}'. "
        "Foundit master data locationId must be confirmed and configured."
    )

def resolve_job_role_and_industry(job_application, creds):
    """
    Resolves roleList and industryList per job category:
    - Software development roles -> roleId: 734 ("Software Engineer/Programmer", function: "IT"), industryId: 140 ("Consumer Software").
    - Trainee roles -> roleId: 733 ("Trainee", function: "IT"), industryId: 140.
    - Network/Firewall/Security roles -> requires network_role_id or explicit role_id configuration. Refuses to silently assign 734.
    - Other roles -> requires confirmed role_id and industry_id. Refuses to silently misclassify.
    """
    pos = (job_application.position or "").strip()
    pos_lower = pos.lower()

    # Network / Security / Firewall roles
    is_network_security = bool(re.search(r'\b(network|firewall|fortinet|cisco|security|cybersecurity)\b', pos_lower))
    if is_network_security:
        net_role_id = creds.get("network_role_id") or creds.get("role_id")
        net_role_name = creds.get("network_role_name") or creds.get("role_name")
        net_func_name = creds.get("function_name") or "IT"
        net_ind_id = creds.get("network_industry_id") or creds.get("industry_id")
        net_ind_name = creds.get("network_industry_name") or creds.get("industry_name")

        if not net_role_id or not net_role_name or str(net_role_id).strip() == "734":
            raise FounditValidationError(
                f"Validation Error: Unresolved Foundit roleId for Network/Security role '{pos}'. "
                "Cannot silently assign Software Engineer/Programmer (roleId 734). "
                "Official Foundit master-data roleId for Network/Security roles must be confirmed and configured."
            )
        try:
            r_id = int(str(net_role_id).strip())
            i_id = int(str(net_ind_id).strip()) if net_ind_id else 140
        except (ValueError, TypeError) as e:
            raise FounditValidationError(f"Validation Error: Invalid role or industry ID: {e}")
        return (
            [{"roleId": r_id, "roleName": str(net_role_name).strip(), "functionName": str(net_func_name).strip()}],
            [{"industryId": i_id, "industryName": str(net_ind_name or "IT").strip()}]
        )

    # Trainee roles
    is_trainee = bool(re.search(r'\b(trainee|intern)\b', pos_lower))
    if is_trainee:
        ind_id = int(str(creds.get("industry_id") or creds.get("default_industry_id") or 140).strip())
        ind_name = str(creds.get("industry_name") or creds.get("default_industry_name") or "Consumer Software").strip()
        return (
            [{"roleId": 733, "roleName": "Trainee", "functionName": "IT"}],
            [{"industryId": ind_id, "industryName": ind_name}]
        )

    # QA / Testing roles (Official Foundit Master Data: roleId 746)
    is_qa = bool(re.search(r'\b(qa|quality assurance|tester|testing|sdet|test engineer)\b', pos_lower))
    if is_qa:
        ind_id = int(str(creds.get("industry_id") or creds.get("default_industry_id") or 140).strip())
        ind_name = str(creds.get("industry_name") or creds.get("default_industry_name") or "Consumer Software").strip()
        return (
            [{"roleId": 746, "roleName": "Software Test Engineer", "functionName": "IT"}],
            [{"industryId": ind_id, "industryName": ind_name}]
        )

    # Systems / DevOps / Infrastructure roles (Official Foundit Master Data: roleId 1077)
    is_systems = bool(re.search(r'\b(systems engineer|system administrator|sysadmin|devops|sre|infrastructure)\b', pos_lower))
    if is_systems:
        ind_id = int(str(creds.get("industry_id") or creds.get("default_industry_id") or 140).strip())
        ind_name = str(creds.get("industry_name") or creds.get("default_industry_name") or "Consumer Software").strip()
        return (
            [{"roleId": 1077, "roleName": "Systems Engineer", "functionName": "IT"}],
            [{"industryId": ind_id, "industryName": ind_name}]
        )

    # Database / DBA roles (Official Foundit Master Data: roleId 740)
    is_dba = bool(re.search(r'\b(dba|database administrator|database architect)\b', pos_lower))
    if is_dba:
        ind_id = int(str(creds.get("industry_id") or creds.get("default_industry_id") or 140).strip())
        ind_name = str(creds.get("industry_name") or creds.get("default_industry_name") or "Consumer Software").strip()
        return (
            [{"roleId": 740, "roleName": "Database Administrator (DBA)", "functionName": "IT"}],
            [{"industryId": ind_id, "industryName": ind_name}]
        )

    # Software Engineering roles
    is_software = bool(re.search(r'\b(software|developer|programmer|full\s*stack|backend|frontend|web|python|java|\.net|node|react|angular|ai\s*engineer|ml\s*engineer|ai/ml|machine\s*learning|data\s*engineer)\b', pos_lower))
    if is_software or not pos:
        role_id_raw = creds.get("role_id") or creds.get("default_role_id")
        role_name = creds.get("role_name") or creds.get("default_role_name")
        func_name = creds.get("function_name") or creds.get("default_function_name") or "IT"
        ind_id_raw = creds.get("industry_id") or creds.get("default_industry_id")
        ind_name = creds.get("industry_name") or creds.get("default_industry_name")

        if not role_id_raw or not role_name or not str(role_id_raw).strip():
            raise FounditValidationError(
                "Validation Error: Missing Foundit roleId / roleName configuration. "
                "Foundit master data role values must be confirmed and configured."
            )
        if not ind_id_raw or not ind_name or not str(ind_id_raw).strip():
            raise FounditValidationError(
                "Validation Error: Missing Foundit industryId / industryName configuration. "
                "Foundit master data industry values must be confirmed and configured."
            )

        try:
            role_id = int(str(role_id_raw).strip())
            ind_id = int(str(ind_id_raw).strip())
        except (ValueError, TypeError):
            raise FounditValidationError("Validation Error: Invalid Foundit roleId or industryId. Must be integers.")

        return (
            [{"roleId": role_id, "roleName": str(role_name).strip(), "functionName": str(func_name).strip()}],
            [{"industryId": ind_id, "industryName": str(ind_name).strip()}]
        )

    # Other non-software roles (e.g. QA, HR, Finance)
    custom_role_id = creds.get("role_id")
    custom_role_name = creds.get("role_name")
    if not custom_role_id or not custom_role_name or str(custom_role_id).strip() == "734":
        raise FounditValidationError(
            f"Validation Error: Unresolved Foundit roleId for role '{pos}'. "
            "Cannot silently assign Software Engineer/Programmer (roleId 734) to unrelated roles. "
            "Official Foundit master-data roleId for this role category must be confirmed and configured."
        )
    try:
        r_id = int(str(custom_role_id).strip())
        i_id = int(str(creds.get("industry_id") or 140).strip())
    except (ValueError, TypeError) as e:
        raise FounditValidationError(f"Validation Error: Invalid role or industry ID: {e}")
    return (
        [{"roleId": r_id, "roleName": str(custom_role_name).strip(), "functionName": str(creds.get("function_name") or "IT").strip()}],
        [{"industryId": i_id, "industryName": str(creds.get("industry_name") or "Consumer Software").strip()}]
    )

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
        location_list = resolve_job_location(job_application, creds)

        # 4. Industry & Role Master Data Mapping (Mandatory in PDF Pages 3, 4, 9, 13-14)
        role_list, industry_list = resolve_job_role_and_industry(job_application, creds)

        # 5. Salary Configuration (Mandatory in PDF Pages 3-5, 8, 13-14)
        min_salary, max_salary = extract_job_salary(job_application, creds)

        curr_id_raw = creds.get("currency_id") or creds.get("default_currency_id") or "1"
        try:
            currency_id = int(str(curr_id_raw).strip())
        except (ValueError, TypeError):
            currency_id = 1
        salary_confidential = str(creds.get("salary_confidential") or creds.get("default_salary_confidential") or "1").strip()

        # 6. Skills List & Priority Mapping (PDF Pages 5, 14-15; skillId: 0 for custom skills)
        skills = extract_job_skills(job_application)
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

        # 7. Core Posting Identifiers & Metadata
        folder_id = int(existing_folder_id) if existing_folder_id else 0
        base_url = (os.getenv("PUBLIC_CAREER_PORTAL_URL") or "https://people-prime.com").rstrip("/")
        apply_url = f"{base_url}/job-details?id={job_application.id}&src=Foundit"
        clean_desc = extract_clean_job_description(job_application.remarks or "")
        start_date = timezone.now().strftime("%Y-%m-%d")

        min_exp, max_exp = extract_job_experience(job_application)

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
