export type UserRole =
  | 'ADMIN'
  | 'CEO'
  | 'SENIOR_MANAGER'
  | 'JUNIOR_MANAGER'
  | 'TEAM_LEAD'
  | 'SUB_LEAD'
  | 'SENIOR_ANALYST'
  | 'ASSOCIATE_ANALYST'
  | 'REPORTING_TEAM';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  reporting_to?: {
    id?: string;
    full_name: string;
    email: string;
    role: UserRole;
  } | null;
  reporting_to_list?: Array<{
    id?: string;
    full_name: string;
    email: string;
    role: UserRole;
  }> | null;

  team?: {
    id: string;
    name: string;
  } | null;
  teams?: Array<{
    id: string;
    name: string;
  }> | null;
  date_of_joining: string;
  is_active: boolean;
  must_change_password: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  team_lead?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  members_count?: number;
}

export type ApplicationStatus =
  | 'New'
  | 'Submitted'
  | 'Placed'
  | 'Under Review'
  | 'Interview Scheduled'
  | 'Interview Completed'
  | 'Offer Sent'
  | 'Offer Accepted'
  | 'Offer Rejected'
  | 'Selected'
  | 'Rejected'
  | 'On Hold'
  | 'Closed';

export interface Application {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  client_name: string;
  city?: string;
  state?: string;
  country?: string;
  position: string;
  technology: string;
  experience: number;
  recruiter: string;
  assigned_employee?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  status: ApplicationStatus;
  remarks: string;
  pan_card?: string;
  aadhaar?: string;
  alternate_mobile_number?: string;
  source?: string;
  interest_to_work_for_client?: string;
  created_at: string;
  updated_at: string;
  transition_dates?: Record<string, string>;
  modified_by?: string;
  publish_to_career_page?: boolean;
  publish_to_linkedin?: boolean;
  published_at?: string | null;
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  author: {
    id: string;
    full_name: string;
    role: UserRole;
  };
  content: string;
  created_at: string;
}

export interface CareerPortalApplicant {
  id: number;
  job: number;
  job_code?: string | null;
  first_name: string;
  last_name: string;
  mobile_number: string;
  alternate_mobile_number?: string;
  email: string;
  qualification: string;
  years_of_experience: string | number;
  expected_pay: string | number;
  primary_skills: string;
  current_ctc: string | number;
  current_company: string;
  state: string;
  city: string;
  resume?: string;
  accepted_terms: boolean;
  source: string;
  status: string;
  modified_by?: string;
  is_imported: boolean;
  imported_at?: string | null;
  imported_by?: string;
  ai_match_score?: number | null;
  ai_scored_at?: string | null;
  created_at: string;
  updated_at: string;
}

