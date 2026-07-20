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

    class Meta:
        model = Application
        fields = [
            'id', 'candidate_name', 'candidate_email', 'candidate_phone',
            'client_name', 'city', 'state', 'position', 'technology', 'experience', 'recruiter',
            'assigned_employee', 'assigned_employee_id', 'status', 'remarks',
            'pan_card', 'aadhaar', 'alternate_mobile_number', 'source', 'interest_to_work_for_client',
            'modified_by', 'created_at', 'updated_at', 'notes'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'modified_by']

    def validate(self, data):
        candidate_email = data.get('candidate_email')
        candidate_phone = data.get('candidate_phone')
        position = data.get('position')
        client_name = data.get('client_name')
        instance = self.instance

        if candidate_email and candidate_phone and position and client_name:
            # Check globally if candidate is already assigned to the selected job (by ANY associate)
            existing_assignments = Application.objects.exclude(candidate_name='').filter(
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
