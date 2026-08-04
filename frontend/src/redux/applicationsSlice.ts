import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Application, ApplicationNote, ApplicationStatus } from '../types';

interface ApplicationsState {
  applications: Application[];
  notes: Record<string, ApplicationNote[]>; // Keyed by application_id
  loading: boolean;
  error: string | null;
}

const initialState: ApplicationsState = {
  applications: [],
  notes: {},
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
