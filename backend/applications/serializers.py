from rest_framework import serializers
from applications.models import Application, Note
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
            'modified_by', 'created_at', 'updated_at', 'notes', 'transition_dates'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'modified_by']

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

    def validate(self, data):
        candidate_email = data.get('candidate_email')
        candidate_phone = data.get('candidate_phone')
        position = data.get('position')
        client_name = data.get('client_name')
        assigned_employee = data.get('assigned_employee')
        instance = self.instance

        if candidate_email and candidate_phone and position and client_name and assigned_employee:
            # Only block if the SAME associate tries to assign the same candidate to the same job twice
            existing_assignments = Application.objects.exclude(candidate_name='').filter(
                assigned_employee=assigned_employee,
                candidate_email__iexact=candidate_email.strip(),
                candidate_phone=candidate_phone.strip(),
                position__iexact=position.strip(),
                client_name__iexact=client_name.strip()
            )
            if instance:
                existing_assignments = existing_assignments.exclude(id=instance.id)
            if existing_assignments.exists():
                raise serializers.ValidationError({
                    "non_field_errors": "CANDIDATE_ALREADY_ASSIGNED_TO_JOB"
                })

        return data

class ApplicationCreateSerializer(ApplicationSerializer):
    class Meta(ApplicationSerializer.Meta):
        pass
