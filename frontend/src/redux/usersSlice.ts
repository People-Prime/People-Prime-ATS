import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../types';

interface UsersState {
  users: User[];
  loading: boolean;
  error: string | null;
}

const initialState: UsersState = {
  users: [],
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
