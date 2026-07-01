import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Application, ApplicationNote, ApplicationStatus } from '../types';

interface ApplicationsState {
  applications: Application[];
  notes: Record<string, ApplicationNote[]>; // Keyed by application_id
  loading: boolean;
  error: string | null;
}

// Initial mock applications
const mockApplications: Application[] = [
  {
    id: 'app_1',
    candidate_name: 'Alice Smith',
    candidate_email: 'alice.smith@gmail.com',
    candidate_phone: '+1-555-0199',
    client_name: 'Microsoft',
    position: 'Senior React Developer',
    technology: 'React / TypeScript / MUI',
    experience: 5.5,
    recruiter: 'Ryan Reynolds',
    assigned_employee: {
      id: 'usr_associate',
      full_name: 'Ryan Reynolds',
      email: 'ryan.reynolds@peopleprimeats.com'
    },
    status: 'Under Review',
    remarks: 'Candidate has strong background in component library architectures.',
    created_at: '2026-06-10T10:00:00Z',
    updated_at: '2026-06-12T14:30:00Z',
  },
  {
    id: 'app_2',
    candidate_name: '', // Empty candidate, represents a fresh job posting assigned to associate analyst
    candidate_email: '',
    candidate_phone: '',
    client_name: 'Amazon Web Services',
    position: 'Cloud Infrastructure Engineer',
    technology: 'AWS / Terraform / Python',
    experience: 4,
    recruiter: '',
    assigned_employee: {
      id: 'usr_associate',
      full_name: 'Ryan Reynolds',
      email: 'ryan.reynolds@peopleprimeats.com'
    },
    status: 'New', // Represents a newly assigned job requirement
    remarks: 'Needs candidate with AWS Solutions Architect certification.',
    created_at: '2026-06-20T09:00:00Z',
    updated_at: '2026-06-20T09:00:00Z',
  },
  {
    id: 'app_3',
    candidate_name: 'Bob Johnson',
    candidate_email: 'bob.johnson@yahoo.com',
    candidate_phone: '+1-555-0144',
    client_name: 'Goldman Sachs',
    position: 'Django Backend Architect',
    technology: 'Python / Django / PostgreSQL',
    experience: 7,
    recruiter: 'Ryan Reynolds',
    assigned_employee: {
      id: 'usr_associate',
      full_name: 'Ryan Reynolds',
      email: 'ryan.reynolds@peopleprimeats.com'
    },
    status: 'Interview Scheduled',
    remarks: 'Round 1 technical interview scheduled for June 25.',
    created_at: '2026-06-15T11:20:00Z',
    updated_at: '2026-06-18T08:15:00Z',
  },
  {
    id: 'app_4',
    candidate_name: 'Clara Oswald',
    candidate_email: 'clara.oswald@gmail.com',
    candidate_phone: '+1-555-0188',
    client_name: 'JP Morgan Chase',
    position: 'Full Stack Engineer',
    technology: 'React / Node.js / PostgreSQL',
    experience: 3.2,
    recruiter: 'Johanna Doe',
    assigned_employee: {
      id: 'usr_assoc_2',
      full_name: 'Johanna Doe',
      email: 'johanna.doe@peopleprimeats.com'
    },
    status: 'Submitted',
    remarks: 'Submitted resume to client. Waiting for screening feedback.',
    created_at: '2026-06-18T15:40:00Z',
    updated_at: '2026-06-19T10:12:00Z',
  },
  {
    id: 'app_5',
    candidate_name: 'David Tennant',
    candidate_email: 'david.tennant@gmail.com',
    candidate_phone: '+1-555-0122',
    client_name: 'Netflix',
    position: 'Senior Systems Engineer',
    technology: 'Java / Microservices / AWS',
    experience: 8,
    recruiter: 'Ryan Reynolds',
    assigned_employee: {
      id: 'usr_associate',
      full_name: 'Ryan Reynolds',
      email: 'ryan.reynolds@peopleprimeats.com'
    },
    status: 'Selected',
    remarks: 'Offer accepted! Joining on July 10.',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-15T16:00:00Z',
  },
  {
    id: 'app_6',
    candidate_name: 'Peter Capaldi',
    candidate_email: 'peter.capaldi@hotmail.com',
    candidate_phone: '+1-555-0155',
    client_name: 'Microsoft',
    position: 'MUI Frontend Specialist',
    technology: 'React / MUI / CSS',
    experience: 6,
    recruiter: 'Johanna Doe',
    assigned_employee: {
      id: 'usr_assoc_2',
      full_name: 'Johanna Doe',
      email: 'johanna.doe@peopleprimeats.com'
    },
    status: 'Rejected',
    remarks: 'Client rejected after Round 2 tech panel (lacked TypeScript skills).',
    created_at: '2026-06-05T14:00:00Z',
    updated_at: '2026-06-08T11:00:00Z',
  },
  {
    id: 'app_7',
    candidate_name: '', // Empty, newly created by lead, assigned to associate Johanna
    candidate_email: '',
    candidate_phone: '',
    client_name: 'Google',
    position: 'Staff Engineer',
    technology: 'Go / Kubernetes',
    experience: 10,
    recruiter: '',
    assigned_employee: {
      id: 'usr_assoc_2',
      full_name: 'Johanna Doe',
      email: 'johanna.doe@peopleprimeats.com'
    },
    status: 'New',
    remarks: 'High priority opening. Go experience is mandatory.',
    created_at: '2026-06-22T16:30:00Z',
    updated_at: '2026-06-22T16:30:00Z',
  }
];

const mockNotes: Record<string, ApplicationNote[]> = {
  app_1: [
    {
      id: 'note_1_1',
      application_id: 'app_1',
      author: { id: 'usr_tl', full_name: 'David Miller', role: 'TEAM_LEAD' },
      content: 'Added job description and assigned to Ryan. Please source a strong candidate.',
      created_at: '2026-06-10T10:05:00Z',
    },
    {
      id: 'note_1_2',
      application_id: 'app_1',
      author: { id: 'usr_associate', full_name: 'Ryan Reynolds', role: 'ASSOCIATE_ANALYST' },
      content: 'Sourced Alice Smith. She has 5 years of experience with React and Material UI. Submitting candidate.',
      created_at: '2026-06-11T09:30:00Z',
    },
    {
      id: 'note_1_3',
      application_id: 'app_1',
      author: { id: 'usr_sl', full_name: 'Emily Watson', role: 'SUB_LEAD' },
      content: 'Screened candidate. Excellent communication and design system knowledge. Moved to Under Review.',
      created_at: '2026-06-12T14:30:00Z',
    }
  ],
  app_2: [
    {
      id: 'note_2_1',
      application_id: 'app_2',
      author: { id: 'usr_sl', full_name: 'Emily Watson', role: 'SUB_LEAD' },
      content: 'Sourced directly from Amazon account manager. Ryan, please find a certified AWS cloud developer.',
      created_at: '2026-06-20T09:05:00Z',
    }
  ],
};

const initialState: ApplicationsState = {
  applications: mockApplications,
  notes: mockNotes,
  loading: false,
  error: null,
};

const applicationsSlice = createSlice({
  name: 'applications',
  initialState,
  reducers: {
    setApplications(state, action: PayloadAction<Application[]>) {
      state.applications = action.payload;
    },
    addApplication(state, action: PayloadAction<Application>) {
      state.applications.unshift(action.payload);
    },
    updateApplication(state, action: PayloadAction<Application>) {
      const idx = state.applications.findIndex(a => a.id === action.payload.id);
      if (idx !== -1) {
        state.applications[idx] = action.payload;
      }
    },
    changeApplicationStatus(state, action: PayloadAction<{ id: string; status: ApplicationStatus }>) {
      const idx = state.applications.findIndex(a => a.id === action.payload.id);
      if (idx !== -1) {
        state.applications[idx].status = action.payload.status;
        state.applications[idx].updated_at = new Date().toISOString();
      }
    },
    assignApplication(state, action: PayloadAction<{ id: string; assigned_employee: Application['assigned_employee'] }>) {
      const idx = state.applications.findIndex(a => a.id === action.payload.id);
      if (idx !== -1) {
        state.applications[idx].assigned_employee = action.payload.assigned_employee;
        state.applications[idx].updated_at = new Date().toISOString();
      }
    },
    deleteApplication(state, action: PayloadAction<string | number>) {
      state.applications = state.applications.filter(a => String(a.id) !== String(action.payload));
    },
    addApplicationNote(state, action: PayloadAction<ApplicationNote>) {
      const appId = action.payload.application_id;
      if (!state.notes[appId]) {
        state.notes[appId] = [];
      }
      state.notes[appId].push(action.payload);
    }
  },
});

export const { 
  setApplications,
  addApplication, 
  updateApplication, 
  changeApplicationStatus, 
  assignApplication, 
  deleteApplication,
  addApplicationNote 
} = applicationsSlice.actions;
export default applicationsSlice.reducer;
