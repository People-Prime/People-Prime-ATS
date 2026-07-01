import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { api } from '../services/api';
import { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
}

// Decode JWT token payload manually to get claims (fallback if needed)
const parseJwt = (token: string) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

// Async Thunk to authenticate against the live Django API
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { email: string; password: CheckPassword }, { rejectWithValue }) => {
    try {
      const response = await api.post('auth/login/', {
        email: credentials.email,
        password: credentials.password,
      });

      const { access, refresh } = response.data;
      const decoded = parseJwt(access);
      
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      const userProfile: User = {
        id: decoded.email,
        email: decoded.email,
        full_name: decoded.full_name,
        role: decoded.role as UserRole,
        reporting_to: null, // Fetched in detailed views
        team: null,
        date_of_joining: '',
        is_active: true,
        must_change_password: decoded.must_change_password,
      };

      // Persist credentials
      localStorage.setItem('ats-token', access);
      localStorage.setItem('ats-refresh-token', refresh);
      localStorage.setItem('ats-user', JSON.stringify(userProfile));

      return { user: userProfile, token: access };
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || 'Invalid email or password.';
      return rejectWithValue(errMsg);
    }
  }
);

// Async Thunk to update employee password
export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (data: { old_password: string; new_password: string }, { rejectWithValue }) => {
    try {
      const response = await api.put('auth/change-password/', data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to update password.');
    }
  }
);

// Resolve persisted session state on app load
const savedUser = localStorage.getItem('ats-user');
const savedToken = localStorage.getItem('ats-token');

const initialState: AuthState = {
  user: savedUser ? JSON.parse(savedUser) : null,
  isAuthenticated: !!savedToken,
  token: savedToken || null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.isAuthenticated = false;
      state.token = null;
      localStorage.removeItem('ats-token');
      localStorage.removeItem('ats-refresh-token');
      localStorage.removeItem('ats-user');
    },
    clearAuthError(state) {
      state.error = null;
    },
    updateLocalUser(state, action: PayloadAction<Partial<User>>) {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        localStorage.setItem('ats-user', JSON.stringify(state.user));
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Login Thunk Actions
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearAuthError, updateLocalUser } = authSlice.actions;
export default authSlice.reducer;
// Type helpers
type CheckPassword = string;
