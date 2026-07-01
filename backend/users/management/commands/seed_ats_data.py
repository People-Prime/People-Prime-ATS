from django.core.management.base import BaseCommand
from django.utils import timezone
from users.models import User, Role
from teams.models import Team
from applications.models import Application, ApplicationStatus, Note

class Command(BaseCommand):
    help = 'Seeds the ATS database with initial teams, users, and candidate applications'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding database with People Prime ATS records...')

        # 1. Clear existing data to avoid conflicts
        Note.objects.all().delete()
        Application.objects.all().delete()
        User.objects.all().exclude(is_superuser=True).delete()
        Team.objects.all().delete()

        # 2. Create Teams
        team_alpha = Team.objects.create(
            name='Alpha Core Dev',
            description='Responsible for core React dashboard widgets and frontend performance tuning.'
        )
        team_beta = Team.objects.create(
            name='Beta Solutions',
            description='Handles client integrations, database deployments, and AWS cloud management.'
        )
        self.stdout.write(f'Created teams: {team_alpha.name}, {team_beta.name}')

        # 3. Create CEO
        ceo = User.objects.create_user(
            email='ceo@peopleprimeats.com',
            full_name='Alexander Pierce',
            password='password123',
            role=Role.CEO,
            date_of_joining='2024-01-01',
            must_change_password=False
        )

        # 4. Create Senior Manager
        sr_mgr = User.objects.create_user(
            email='sarah.connor@peopleprimeats.com',
            full_name='Sarah Connor',
            password='password123',
            role=Role.SENIOR_MANAGER,
            reporting_to=ceo,
            date_of_joining='2024-03-15',
            must_change_password=False
        )

        # 5. Create Junior Manager
        jr_mgr = User.objects.create_user(
            email='james.carter@peopleprimeats.com',
            full_name='James Carter',
            password='password123',
            role=Role.JUNIOR_MANAGER,
            reporting_to=sr_mgr,
            date_of_joining='2024-06-10',
            must_change_password=False
        )

        # 6. Create Team Lead & Sub Lead for Team Alpha
        tl_alpha = User.objects.create_user(
            email='david.miller@peopleprimeats.com',
            full_name='David Miller',
            password='password123',
            role=Role.TEAM_LEAD,
            reporting_to=jr_mgr,
            team=team_alpha,
            date_of_joining='2024-09-01',
            must_change_password=False
        )
        team_alpha.team_lead = tl_alpha
        team_alpha.save()

        sl_alpha = User.objects.create_user(
            email='emily.watson@peopleprimeats.com',
            full_name='Emily Watson',
            password='password123',
            role=Role.SUB_LEAD,
            reporting_to=tl_alpha,
            team=team_alpha,
            date_of_joining='2025-01-10',
            must_change_password=False
        )

        # 7. Create Associates for Team Alpha
        assoc_ryan = User.objects.create_user(
            email='ryan.reynolds@peopleprimeats.com',
            full_name='Ryan Reynolds',
            password='password123',
            role=Role.ASSOCIATE_ANALYST,
            reporting_to=sl_alpha,
            team=team_alpha,
            date_of_joining='2025-03-01',
            must_change_password=False
        )
        
        assoc_johanna = User.objects.create_user(
            email='johanna.doe@peopleprimeats.com',
            full_name='Johanna Doe',
            password='password123',
            role=Role.ASSOCIATE_ANALYST,
            reporting_to=sl_alpha,
            team=team_alpha,
            date_of_joining='2025-04-15',
            must_change_password=True
        )

        # 8. Create Team Lead & Sub Lead for Team Beta
        tl_beta = User.objects.create_user(
            email='bruce.wayne@peopleprimeats.com',
            full_name='Bruce Wayne',
            password='password123',
            role=Role.TEAM_LEAD,
            reporting_to=jr_mgr,
            team=team_beta,
            date_of_joining='2024-05-20',
            must_change_password=False
        )
        team_beta.team_lead = tl_beta
        team_beta.save()

        sl_beta = User.objects.create_user(
            email='clark.kent@peopleprimeats.com',
            full_name='Clark Kent',
            password='password123',
            role=Role.SUB_LEAD,
            reporting_to=tl_beta,
            team=team_beta,
            date_of_joining='2024-11-01',
            must_change_password=False
        )

        assoc_diana = User.objects.create_user(
            email='diana.prince@peopleprimeats.com',
            full_name='Diana Prince',
            password='password123',
            role=Role.ASSOCIATE_ANALYST,
            reporting_to=sl_beta,
            team=team_beta,
            date_of_joining='2025-01-15',
            must_change_password=False
        )

        self.stdout.write('Created employee directory (CEO, Managers, Leads, Associates).')

        # 9. Create Sourced Applications
        app_1 = Application.objects.create(
            candidate_name='Alice Smith',
            candidate_email='alice.smith@gmail.com',
            candidate_phone='+1-555-0199',
            client_name='Microsoft',
            position='Senior React Developer',
            technology='React / TypeScript / MUI',
            experience=5.5,
            recruiter='Ryan Reynolds',
            assigned_employee=assoc_ryan,
            status=ApplicationStatus.UNDER_REVIEW,
            remarks='Candidate has strong background in component library architectures.'
        )

        app_2 = Application.objects.create(
            candidate_name='', # Sourcing pending
            candidate_email='',
            candidate_phone='',
            client_name='Amazon Web Services',
            position='Cloud Infrastructure Engineer',
            technology='AWS / Terraform / Python',
            experience=4.0,
            recruiter='',
            assigned_employee=assoc_ryan,
            status=ApplicationStatus.NEW,
            remarks='Needs candidate with AWS Solutions Architect certification.'
        )

        app_3 = Application.objects.create(
            candidate_name='Bob Johnson',
            candidate_email='bob.johnson@yahoo.com',
            candidate_phone='+1-555-0144',
            client_name='Goldman Sachs',
            position='Django Backend Architect',
            technology='Python / Django / PostgreSQL',
            experience=7.0,
            recruiter='Ryan Reynolds',
            assigned_employee=assoc_ryan,
            status=ApplicationStatus.INTERVIEW_SCHEDULED,
            remarks='Round 1 technical interview scheduled for June 25.'
        )

        app_4 = Application.objects.create(
            candidate_name='Clara Oswald',
            candidate_email='clara.oswald@gmail.com',
            candidate_phone='+1-555-0188',
            client_name='JP Morgan Chase',
            position='Full Stack Engineer',
            technology='React / Node.js / PostgreSQL',
            experience=3.2,
            recruiter='Johanna Doe',
            assigned_employee=assoc_johanna,
            status=ApplicationStatus.SUBMITTED,
            remarks='Submitted resume to client. Waiting for screening feedback.'
        )

        app_5 = Application.objects.create(
            candidate_name='David Tennant',
            candidate_email='david.tennant@gmail.com',
            candidate_phone='+1-555-0122',
            client_name='Netflix',
            position='Senior Systems Engineer',
            technology='Java / Microservices / AWS',
            experience=8.0,
            recruiter='Ryan Reynolds',
            assigned_employee=assoc_ryan,
            status=ApplicationStatus.SELECTED,
            remarks='Offer accepted! Joining on July 10.'
        )

        # 10. Create Application Notes
        Note.objects.create(
            application=app_1,
            author=tl_alpha,
            content='Added job description and assigned to Ryan. Please source a strong candidate.'
        )
        Note.objects.create(
            application=app_1,
            author=assoc_ryan,
            content='Sourced Alice Smith. She has 5 years of experience with React and Material UI. Submitting candidate.'
        )
        Note.objects.create(
            application=app_1,
            author=sl_alpha,
            content='Screened candidate. Excellent communication and design system knowledge. Moved to Under Review.'
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded database with ATS data!'))
