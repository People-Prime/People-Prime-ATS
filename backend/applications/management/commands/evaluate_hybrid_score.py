import csv
import logging
from django.core.management.base import BaseCommand
from applications.models import CareerPortalApplicant

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Evaluates the Hybrid Score vs the old Semantic-only Score.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100, help='Number of records to evaluate.')
        parser.add_argument('--export', type=str, default='hybrid_evaluation.csv', help='CSV export path.')

    def handle(self, *args, **options):
        limit = options.get('limit')
        export_path = options.get('export')

        self.stdout.write(self.style.NOTICE("--- Starting Hybrid Score Evaluation ---"))

        # Fetch applicants that have both the old semantic score and the new hybrid components
        qs = CareerPortalApplicant.objects.filter(
            ai_match_score__isnull=False,
            ai_match_score_nemotron__isnull=False,
            score_semantic__isnull=False
        ).select_related('job').order_by('-id')[:limit]

        count = qs.count()
        self.stdout.write(f"Found {count} candidate records for evaluation.")

        if count == 0:
            self.stdout.write(self.style.WARNING("No dual-scored records found. Did you run the Phase 4 backfill?"))
            return

        with open(export_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Applicant ID', 'Job Title', 'Candidate Exp', 'Req Exp',
                'Old Score (Semantic Only)', 'New Hybrid Score',
                'Semantic (40%)', 'Skills (30%)', 'Experience (15%)', 'Title (10%)', 'Edu/Loc (5%)',
                'Score Delta'
            ])
            
            total_delta = 0
            false_positives_fixed = 0

            for app in qs:
                old_score = app.ai_match_score
                new_score = app.ai_match_score_nemotron
                delta = new_score - old_score
                total_delta += delta
                
                # Identify fixed false positives (where old score was >80 but experience was low and new score <60)
                req_exp = float(app.job.experience) if app.job.experience else 0.0
                app_exp = float(app.years_of_experience) if app.years_of_experience else 0.0
                if old_score > 80 and app_exp < (req_exp / 2) and new_score < 70:
                    false_positives_fixed += 1

                writer.writerow([
                    app.id, app.job.position, app_exp, req_exp,
                    round(old_score, 2), round(new_score, 2),
                    app.score_semantic, app.score_skills, app.score_experience, app.score_title, app.score_education,
                    round(delta, 2)
                ])

        avg_delta = total_delta / count
        
        self.stdout.write(self.style.SUCCESS(f"\nEvaluation Complete!"))
        self.stdout.write(f"Average Score Change (Delta): {round(avg_delta, 2)}")
        self.stdout.write(self.style.SUCCESS(f"False Positives Automatically Fixed (Low Exp/High Semantic): {false_positives_fixed}"))
        self.stdout.write(self.style.NOTICE(f"Exported detailed results to: {export_path}"))
