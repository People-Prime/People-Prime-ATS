from rest_framework import serializers
from applications.models import Application, Note, CareerPortalApplicant
from users.serializers import UserMinimalSerializer
from users.models import User

class NoteSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Note
        fields = ['id', 'application', 'author', 'content', 'created_at']
        read_only_fields = ['id', 'application', 'author', 'created_at']

class ApplicationSerializer(serializers.ModelSerializer):
    assigned_employee = UserMinimalSerializer(read_only=True)
    assigned_employee_id = serializers.SlugRelatedField(
        queryset=User.objects.filter(is_active=True),
        slug_field='email',
        source='assigned_employee',
        write_only=True,
        required=False,
        allow_null=True
    )
    notes = NoteSerializer(many=True, read_only=True)
    transition_dates = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id', 'candidate_name', 'candidate_email', 'candidate_phone',
            'client_name', 'city', 'state', 'position', 'technology', 'experience', 'recruiter',
            'assigned_employee', 'assigned_employee_id', 'status', 'remarks',
            'pan_card', 'aadhaar', 'alternate_mobile_number', 'source', 'interest_to_work_for_client',
            'modified_by', 'publish_to_career_page', 'publish_to_linkedin', 'published_at',
            'created_at', 'updated_at', 'notes', 'transition_dates'
        ]
        read_only_fields = ['id', 'published_at', 'created_at', 'updated_at', 'modified_by']

    def create(self, validated_data):
        publish_career = validated_data.get('publish_to_career_page', False)
        publish_linkedin = validated_data.get('publish_to_linkedin', False)
        if (publish_career or publish_linkedin) and not validated_data.get('published_at'):
            from django.utils import timezone
            validated_data['published_at'] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        publish_career = validated_data.get('publish_to_career_page', instance.publish_to_career_page)
        publish_linkedin = validated_data.get('publish_to_linkedin', instance.publish_to_linkedin)
        if (publish_career or publish_linkedin) and not instance.published_at:
            from django.utils import timezone
            validated_data['published_at'] = timezone.now()
        return super().update(instance, validated_data)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.parser_context:
            view = request.parser_context.get('view')
            if view and getattr(view, 'action', None) == 'list':
                self.fields.pop('notes', None)

    def get_transition_dates(self, obj):
        dates = {}
        try:
            all_notes = obj.notes.all()
            for note in all_notes:
                content = note.content or ''
                if "Status updated to " in content:
                    parts = content.split("Status updated to ")
                    if len(parts) > 1:
                        status_part = parts[1].split(".")[0].split("\n")[0].strip()
                        dates[status_part] = note.created_at.strftime('%Y-%m-%d')
        except Exception:
            pass
        if obj.status and obj.status not in dates:
            dates[obj.status] = obj.created_at.strftime('%Y-%m-%d')
        return dates

class PublicJobSerializer(serializers.ModelSerializer):
    job_code = serializers.SerializerMethodField()
    required_skills = serializers.SerializerMethodField()
    experience = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    job_type = serializers.SerializerMethodField()
    work_mode = serializers.SerializerMethodField()
    notice_period = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    required_documents = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id', 'job_code', 'position', 'technology', 'required_skills',
            'experience', 'city', 'state', 'location', 'job_type',
            'work_mode', 'notice_period', 'description', 'required_documents',
            'published_at', 'created_at'
        ]

    def _extract_field(self, remarks, field_name):
        import re
        if not remarks:
            return None
        match = re.search(r'' + field_name + r':\s*(.*)', remarks)
        if match:
            val = match.group(1).strip()
            return val if val and val != 'N/A' else None
        return None

    def get_job_code(self, obj):
        return self._extract_field(obj.remarks, 'Job Code')

    def get_required_skills(self, obj):
        import re
        remarks = obj.remarks or ''
        skills = []
        seen_lower = set()

        def add_skill(s):
            item = s.strip()
            if item and item.lower() not in seen_lower:
                seen_lower.add(item.lower())
                skills.append(item)

        # Priority 1: Technical Proficiency in remarks
        if 'Technical Proficiency:' in remarks:
            after_prof = remarks.split('Technical Proficiency:', 1)[1]
            lines = after_prof.split('\n')
            stop_header = re.compile(r'^\s*\[.+\]')
            stop_key = re.compile(
                r'^\s*(Notice Period|Required Documents|Source Option|FileName|Job Code|Client Bill Rate|Pay Rate|Start Date|End Date|Location|Job Status|Job Type|Client Job ID|Address|Work Mode|Employee Type|Zip Code|Degree):\s*',
                re.IGNORECASE
            )

            for line in lines:
                if stop_header.match(line) or stop_key.match(line):
                    break
                clean_line = re.sub(r'^[•\*\-\s]+', '', line).strip()
                if clean_line:
                    for sub in clean_line.split(','):
                        add_skill(sub)

            if skills:
                return skills

        # Priority 2: Fallback to Application.technology
        tech = obj.technology or ''
        if tech:
            for item in tech.split(','):
                add_skill(item)
            if skills:
                return skills

        return []

    def get_experience(self, obj):
        if obj.experience is None:
            return None
        try:
            val = float(obj.experience)
            if val == 0:
                return "0 Years"
            if val.is_integer():
                return f"{int(val)} Years"
            return f"{val} Years"
        except (ValueError, TypeError):
            return None

    def get_location(self, obj):
        loc = self._extract_field(obj.remarks, 'Location')
        if loc:
            return loc
        city_state = [f for f in [obj.city, obj.state] if f]
        return ", ".join(city_state) if city_state else None

    def get_job_type(self, obj):
        return self._extract_field(obj.remarks, 'Job Type')

    def get_work_mode(self, obj):
        return self._extract_field(obj.remarks, 'Work Mode')

    def get_notice_period(self, obj):
        return self._extract_field(obj.remarks, 'Notice Period')

    def get_description(self, obj):
        import re
        remarks = obj.remarks or ''
        if 'Description:' not in remarks:
            return None

        after_desc = remarks.split('Description:', 1)[1]
        lines = after_desc.split('\n')
        desc_lines = []

        stop_header = re.compile(r'^\s*\[.+\]')
        stop_key = re.compile(
            r'^\s*(Technical Proficiency|Notice Period|Required Documents|Source Option|FileName|Job Code|Client Bill Rate|Pay Rate|Start Date|End Date|Location|Job Status|Job Type|Client Job ID|Address|Work Mode|Employee Type|Zip Code|Degree):\s*',
            re.IGNORECASE
        )

        for line in lines:
            if stop_header.match(line) or stop_key.match(line):
                break
            desc_lines.append(line)

        result = "\n".join(desc_lines).strip()
        return result if result else None

    def get_required_documents(self, obj):
        import re
        remarks = obj.remarks or ''
        if 'Required Documents:' not in remarks:
            return None

        after_req = remarks.split('Required Documents:', 1)[1]
        lines = after_req.split('\n')
        doc_lines = []

        stop_header = re.compile(r'^\s*\[.+\]')
        stop_key = re.compile(
            r'^\s*(Address|Work Mode|Employee Type|Zip Code|Source Option|FileName|Job Code|Client Bill Rate|Pay Rate|Start Date|End Date|Location|Job Status|Job Type|Client Job ID|Degree|Notice Period|Technical Proficiency|Description):\s*',
            re.IGNORECASE
        )

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stop_header.match(stripped) or stop_key.match(stripped):
                break
            doc_lines.append(stripped)

        result = ", ".join(doc_lines).strip()
        return result if result and result != 'N/A' else None

class ApplicationCreateSerializer(ApplicationSerializer):
    class Meta(ApplicationSerializer.Meta):
        pass


class PublicJobApplySerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    last_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    full_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    mobile_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mobile = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    alternate_mobile_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    alt_mobile = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')

    email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email_address = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    qualification = serializers.CharField(required=True)
    years_of_experience = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    experience = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    expected_pay = serializers.CharField(required=True)
    primary_skills = serializers.CharField(required=True)
    current_ctc = serializers.CharField(required=True)
    current_company = serializers.CharField(required=True)
    state = serializers.CharField(required=True)
    city = serializers.CharField(required=True)
    resume = serializers.FileField(required=True)

    accepted_terms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    terms_accepted = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        import re
        errors = {}

        # 1. First & Last Name / Full Name resolution
        first_name = (attrs.get('first_name') or '').strip()
        last_name = (attrs.get('last_name') or '').strip()
        full_name = (attrs.get('full_name') or '').strip()

        if not first_name and full_name:
            parts = full_name.split(' ', 1)
            first_name = parts[0].strip()
            last_name = parts[1].strip() if len(parts) > 1 else 'N/A'

        if not first_name:
            errors['first_name'] = ["First Name is required."]
        elif not re.match(r"^[A-Za-z\s\.\'-]+$", first_name):
            errors['first_name'] = ["First Name must contain valid characters."]

        if not last_name:
            last_name = 'N/A'
        elif last_name != 'N/A' and not re.match(r"^[A-Za-z\s\.\'-]+$", last_name):
            errors['last_name'] = ["Last Name must contain valid characters."]

        attrs['first_name'] = first_name
        attrs['last_name'] = last_name

        # 2. Mobile Number resolution
        mobile = (attrs.get('mobile_number') or attrs.get('mobile') or attrs.get('phone') or '').strip()
        clean_mobile = re.sub(r'\D', '', mobile)
        if len(clean_mobile) >= 10:
            clean_mobile = clean_mobile[-10:]
        
        if not clean_mobile or len(clean_mobile) != 10:
            errors['mobile_number'] = ["Mobile Number must contain exactly 10 digits."]
        else:
            attrs['mobile_number'] = clean_mobile

        # Alternate Mobile Number
        alt_mobile = (attrs.get('alternate_mobile_number') or attrs.get('alt_mobile') or '').strip()
        if alt_mobile:
            clean_alt = re.sub(r'\D', '', alt_mobile)
            if len(clean_alt) >= 10:
                clean_alt = clean_alt[-10:]
            if len(clean_alt) != 10:
                errors['alternate_mobile_number'] = ["Alternate Mobile Number must contain 10 digits if provided."]
            else:
                attrs['alternate_mobile_number'] = clean_alt
        else:
            attrs['alternate_mobile_number'] = ''

        # 3. Email resolution
        email = (attrs.get('email') or attrs.get('email_address') or '').strip()
        if not email:
            errors['email'] = ["Email Address is required."]
        elif not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
            errors['email'] = ["Enter a valid email address."]
        else:
            attrs['email'] = email

        # 4. Years of Experience
        exp_val = str(attrs.get('years_of_experience') or attrs.get('experience') or '').strip()
        clean_exp = re.sub(r'[^\d\.]', '', exp_val)
        if not clean_exp:
            errors['years_of_experience'] = ["Years of Experience is required."]
        else:
            try:
                attrs['years_of_experience'] = float(clean_exp)
            except ValueError:
                errors['years_of_experience'] = ["Years of Experience must be numeric."]

        # 5. Expected Pay & Current CTC numeric cleaning
        pay_val = str(attrs.get('expected_pay') or '').strip()
        clean_pay = re.sub(r'[^\d\.]', '', pay_val)
        if not clean_pay:
            errors['expected_pay'] = ["Expected Pay is required."]
        else:
            try:
                attrs['expected_pay'] = float(clean_pay)
            except ValueError:
                errors['expected_pay'] = ["Expected Pay must be numeric."]

        ctc_val = str(attrs.get('current_ctc') or '').strip()
        clean_ctc = re.sub(r'[^\d\.]', '', ctc_val)
        if not clean_ctc:
            errors['current_ctc'] = ["Current CTC is required."]
        else:
            try:
                attrs['current_ctc'] = float(clean_ctc)
            except ValueError:
                errors['current_ctc'] = ["Current CTC must be numeric."]

        # 6. Qualification, Skills, Company, State, City
        for field, name in [
            ('qualification', 'Qualification'),
            ('primary_skills', 'Primary Skills'),
            ('current_company', 'Current Company'),
            ('state', 'State'),
            ('city', 'City')
        ]:
            val = (attrs.get(field) or '').strip()
            if not val:
                errors[field] = [f"{name} is required."]
            else:
                attrs[field] = val

        # 7. Resume validation
        resume = attrs.get('resume')
        if not resume:
            errors['resume'] = ["Resume file is required."]
        else:
            filename = resume.name.lower()
            allowed_extensions = ('.pdf', '.doc', '.docx')
            if not filename.endswith(allowed_extensions):
                errors['resume'] = ["Unsupported file format. Please upload PDF, DOC, or DOCX."]
            elif resume.size > 10 * 1024 * 1024:
                errors['resume'] = ["File size exceeds maximum limit of 10 MB."]

        # 8. Accepted Terms resolution
        terms_raw = attrs.get('accepted_terms') or attrs.get('terms_accepted') or ''
        terms_str = str(terms_raw).lower().strip()
        if terms_str not in ['true', '1', 'yes', 'on', 'true'] and terms_raw is not True:
            errors['accepted_terms'] = ["You must accept the Terms & Conditions."]
        else:
            attrs['accepted_terms'] = True

        if errors:
            raise serializers.ValidationError(errors)

        return attrs


class CareerPortalApplicantSerializer(serializers.ModelSerializer):
    job_code = serializers.SerializerMethodField()

    class Meta:
        model = CareerPortalApplicant
        fields = [
            'id', 'job', 'job_code', 'first_name', 'last_name', 'mobile_number',
            'alternate_mobile_number', 'email', 'qualification', 'years_of_experience',
            'expected_pay', 'primary_skills', 'current_ctc', 'current_company',
            'state', 'city', 'resume', 'accepted_terms', 'source', 'status',
            'is_imported', 'imported_at', 'imported_by', 'imported_application',
            'created_at', 'updated_at'
        ]

    def get_job_code(self, obj):
        if obj.job:
            import re
            remarks = obj.job.remarks or ''
            match = re.search(r'Job Code:\s*(.*)', remarks)
            if match:
                val = match.group(1).strip()
                if val and 'Auto Generated' not in val:
                    return val
            return f"PPW - {obj.job.id:04d}"
        return None


