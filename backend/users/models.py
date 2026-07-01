from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone

class Role(models.TextChoices):
    ADMIN = 'ADMIN', 'Admin (Superuser)'
    CEO = 'CEO', 'CEO'
    SENIOR_MANAGER = 'SENIOR_MANAGER', 'Senior Manager'
    JUNIOR_MANAGER = 'JUNIOR_MANAGER', 'Junior Manager'
    TEAM_LEAD = 'TEAM_LEAD', 'Team Lead'
    SUB_LEAD = 'SUB_LEAD', 'Sub Lead'
    SENIOR_ANALYST = 'SENIOR_ANALYST', 'Senior Analyst'
    ASSOCIATE_ANALYST = 'ASSOCIATE_ANALYST', 'Associate Analyst'

class UserManager(BaseUserManager):
    def create_user(self, email, full_name, password=None, role=Role.ASSOCIATE_ANALYST, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address')
        email = self.normalize_email(email)
        
        # Admin is treated as ADMIN role, CEO as CEO role
        user = self.model(
            email=email,
            full_name=full_name,
            role=role,
            **extra_fields
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('must_change_password', False)
        
        # Superuser role defaults to ADMIN
        return self.create_user(
            email=email,
            full_name=full_name,
            password=password,
            role=Role.ADMIN,
            date_of_joining=timezone.now().date(),
            **extra_fields
        )

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, primary_key=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(
        max_length=50,
        choices=Role.choices,
        default=Role.ASSOCIATE_ANALYST
    )
    reporting_to = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reports'
    )
    team = models.ForeignKey(
        'teams.Team',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='members'
    )
    date_of_joining = models.DateField(default=timezone.now)
    must_change_password = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    
    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return f"{self.full_name} ({self.role})"
