import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../types';

interface UsersState {
  users: User[];
  loading: boolean;
  error: string | null;
}

// Generate a larger set of mock users for metrics display
const mockUsersList: User[] = [
  {
    id: 'usr_admin',
    email: 'admin@peopleprimeats.com',
    full_name: 'Saikrishna K',
    role: 'ADMIN',
    reporting_to: null,
    team: null,
    date_of_joining: '2024-01-01',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_ceo',
    email: 'ceo@peopleprimeats.com',
    full_name: 'Sarah Connor',
    role: 'CEO',
    reporting_to: null,
    team: null,
    date_of_joining: '2024-01-01',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_sr_mgr',
    email: 'sarah.connor@peopleprimeats.com',
    full_name: 'Sarah Connor Manager',
    role: 'SENIOR_MANAGER',
    reporting_to: { id: 'usr_ceo', full_name: 'Sarah Connor', email: 'ceo@peopleprimeats.com', role: 'CEO' },
    team: null,
    date_of_joining: '2024-02-01',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_jr_mgr',
    email: 'james.carter@peopleprimeats.com',
    full_name: 'James Carter',
    role: 'JUNIOR_MANAGER',
    reporting_to: { id: 'usr_sr_mgr', full_name: 'Sarah Connor Manager', email: 'sarah.connor@peopleprimeats.com', role: 'SENIOR_MANAGER' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2024-06-01',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_tl',
    email: 'david.miller@peopleprimeats.com',
    full_name: 'David Miller',
    role: 'TEAM_LEAD',
    reporting_to: { id: 'usr_jr_mgr', full_name: 'James Carter', email: 'james.carter@peopleprimeats.com', role: 'JUNIOR_MANAGER' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2024-08-15',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_sl',
    email: 'emily.watson@peopleprimeats.com',
    full_name: 'Emily Watson',
    role: 'SUB_LEAD',
    reporting_to: { id: 'usr_tl', full_name: 'David Miller', email: 'david.miller@peopleprimeats.com', role: 'TEAM_LEAD' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2024-10-10',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_assoc_1',
    email: 'ryan.reynolds@peopleprimeats.com',
    full_name: 'Ryan Reynolds',
    role: 'ASSOCIATE_ANALYST',
    reporting_to: { id: 'usr_sl', full_name: 'Emily Watson', email: 'emily.watson@peopleprimeats.com', role: 'SUB_LEAD' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2025-01-10',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_assoc_2',
    email: 'johanna.doe@peopleprimeats.com',
    full_name: 'Johanna Doe',
    role: 'ASSOCIATE_ANALYST',
    reporting_to: { id: 'usr_sl', full_name: 'Emily Watson', email: 'emily.watson@peopleprimeats.com', role: 'SUB_LEAD' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2025-04-15',
    is_active: true,
    must_change_password: true,
  },
  {
    id: 'usr_assoc_3',
    email: 'marcus.aurelius@peopleprimeats.com',
    full_name: 'Marcus Aurelius',
    role: 'ASSOCIATE_ANALYST',
    reporting_to: { id: 'usr_sl', full_name: 'Emily Watson', email: 'emily.watson@peopleprimeats.com', role: 'SUB_LEAD' },
    team: { id: 'team_alpha', name: 'Alpha Core Dev' },
    date_of_joining: '2025-02-01',
    is_active: false, // Inactive Analyst
    must_change_password: false,
  },
  {
    id: 'usr_tl_beta',
    email: 'bruce.wayne@peopleprimeats.com',
    full_name: 'Bruce Wayne',
    role: 'TEAM_LEAD',
    reporting_to: { id: 'usr_jr_mgr', full_name: 'James Carter', email: 'james.carter@peopleprimeats.com', role: 'JUNIOR_MANAGER' },
    team: { id: 'team_beta', name: 'Beta Solutions' },
    date_of_joining: '2024-05-20',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_sl_beta',
    email: 'clark.kent@peopleprimeats.com',
    full_name: 'Clark Kent',
    role: 'SUB_LEAD',
    reporting_to: { id: 'usr_tl_beta', full_name: 'Bruce Wayne', email: 'bruce.wayne@peopleprimeats.com', role: 'TEAM_LEAD' },
    team: { id: 'team_beta', name: 'Beta Solutions' },
    date_of_joining: '2024-11-01',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'usr_assoc_beta_1',
    email: 'diana.prince@peopleprimeats.com',
    full_name: 'Diana Prince',
    role: 'ASSOCIATE_ANALYST',
    reporting_to: { id: 'usr_sl_beta', full_name: 'Clark Kent', email: 'clark.kent@peopleprimeats.com', role: 'SUB_LEAD' },
    team: { id: 'team_beta', name: 'Beta Solutions' },
    date_of_joining: '2025-01-15',
    is_active: true,
    must_change_password: false,
  },
];

const initialState: UsersState = {
  users: mockUsersList,
  loading: false,
  error: null,
};

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    fetchUsersStart(state) {
      state.loading = true;
    },
    fetchUsersSuccess(state, action: PayloadAction<User[]>) {
      state.loading = false;
      state.users = action.payload;
    },
    addUser(state, action: PayloadAction<User>) {
      state.users.push(action.payload);
    },
    updateUserInList(state, action: PayloadAction<User>) {
      const idx = state.users.findIndex(u => u.id === action.payload.id);
      if (idx !== -1) {
        state.users[idx] = action.payload;
      }
    },
    toggleUserStatus(state, action: PayloadAction<{ id: string; is_active: boolean }>) {
      const idx = state.users.findIndex(u => u.id === action.payload.id);
      if (idx !== -1) {
        state.users[idx].is_active = action.payload.is_active;
      }
    },
    deleteUser(state, action: PayloadAction<string>) {
      state.users = state.users.filter(u => u.id !== action.payload);
    },
  },
});

export const { fetchUsersStart, fetchUsersSuccess, addUser, updateUserInList, toggleUserStatus, deleteUser } = usersSlice.actions;
export default usersSlice.reducer;
