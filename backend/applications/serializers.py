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
            'created_at', 'updated_at', 'notes'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        candidate_email = data.get('candidate_email')
        candidate_phone = data.get('candidate_phone')
        instance = self.instance

        if candidate_email:
            qs = Application.objects.filter(candidate_email__iexact=candidate_email)
            if instance:
                qs = qs.exclude(id=instance.id)
            if qs.exists():
                phone = candidate_phone or (instance.candidate_phone if instance else '')
                # Allow duplicate email if the phone number is the same (multi-job assignment flow)
                if not qs.filter(candidate_phone=phone).exists():
                    raise serializers.ValidationError({
                        "candidate_email": "A candidate with this email address already exists in the system."
                    })

        if candidate_phone:
            qs = Application.objects.filter(candidate_phone=candidate_phone)
            if instance:
                qs = qs.exclude(id=instance.id)
            if qs.exists():
                email = candidate_email or (instance.candidate_email if instance else '')
                # Allow duplicate phone if the email address is the same (multi-job assignment flow)
                if not qs.filter(candidate_email__iexact=email).exists():
                    raise serializers.ValidationError({
                        "candidate_phone": "A candidate with this phone number already exists in the system."
                    })

        return data

class ApplicationCreateSerializer(ApplicationSerializer):
    class Meta(ApplicationSerializer.Meta):
        pass
