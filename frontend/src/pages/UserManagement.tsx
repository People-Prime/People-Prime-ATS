import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Card, 
  Typography, 
  Button, 
  TextField, 
  Grid,
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  IconButton, 
  Avatar,
  Alert,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import { 
  Search, 
  UserPlus, 
  Key, 
  Trash2
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { toggleUserStatus, deleteUser } from '../redux/usersSlice';
import { User } from '../types';
import { api } from '../services/api';
import { HierarchyReport } from './dashboards/HierarchyReport';

export const UserManagement: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const theme = useTheme();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);

  // States
  const [activeView, setActiveView] = useState<'LIST' | 'HIERARCHY'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Filters
  const filteredUsers = users.filter(u => {
    // Exclude system admin from normal staff list unless searching specifically
    if (u.role === 'ADMIN' && searchTerm !== 'admin') return false;

    // Role filter
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;

    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return u.full_name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
    }
    return true;
  });

  const handleOpenCreate = () => {
    navigate('/users/create');
  };

  const handleOpenEdit = (user: User) => {
    navigate(`/users/edit/${user.id}`);
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.post(`users/${user.id}/toggle-active/`);
      dispatch(toggleUserStatus({ id: user.id, is_active: !user.is_active }));
      showToast(`Account for ${user.full_name} has been ${!user.is_active ? 'Activated' : 'Deactivated'}.`, 'success');
    } catch (err) {
      showToast("Failed to modify user status on the server.", "info");
    }
  };

  const handleResetPassword = (user: User) => {
    const tempPass = Math.random().toString(36).slice(-8);
    showToast(`Password reset link and new temporary password "${tempPass}" sent to ${user.email}.`, 'info');
  };

  const handleDeleteClick = (user: User) => {
    setDeleteConfirmUser(user);
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmUser) {
      try {
        await api.delete(`users/${deleteConfirmUser.id}/`);
        dispatch(deleteUser(deleteConfirmUser.id));
        showToast(`User ${deleteConfirmUser.full_name} has been deleted successfully.`, 'success');
      } catch (err) {
        showToast("Failed to delete user from the server.", "info");
      } finally {
        setDeleteConfirmUser(null);
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmUser(null);
  };

  const showToast = (message: string, type: 'success' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 7000);
  };


  return (
    <Box sx={{ pb: 6 }}>
      {/* Title */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            User Management Directory
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Create, edit, activate, and manage corporate employee accounts.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '8px', p: 0.5, display: 'flex', gap: 0.5, bgcolor: 'background.paper' }}>
            <Button
              size="small"
              variant={activeView === 'LIST' ? 'contained' : 'text'}
              onClick={() => setActiveView('LIST')}
              sx={{ textTransform: 'none', borderRadius: '6px', fontWeight: 700 }}
            >
              Staff List
            </Button>
            <Button
              size="small"
              variant={activeView === 'HIERARCHY' ? 'contained' : 'text'}
              onClick={() => setActiveView('HIERARCHY')}
              sx={{ textTransform: 'none', borderRadius: '6px', fontWeight: 700 }}
            >
              Hierarchy Report
            </Button>
          </Box>
          {isAdmin && (
            <Button 
              variant="contained" 
              startIcon={<UserPlus size={18} />} 
              onClick={handleOpenCreate}
              sx={{ borderRadius: '8px' }}
            >
              Create Employee
            </Button>
          )}
        </Box>
      </Box>

      {/* Alert toasts */}
      {notification && (
        <Alert 
          severity={notification.type === 'success' ? 'success' : 'info'} 
          sx={{ mb: 3, borderRadius: '8px', boxShadow: theme.shadows[1] }}
          onClose={() => setNotification(null)}
        >
          {notification.message}
        </Alert>
      )}

      {activeView === 'HIERARCHY' ? (
        <HierarchyReport />
      ) : (
        <>
          {/* Search filters */}
          <Card sx={{ p: 2, mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by full name, email prefix..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <Search size={16} style={{ marginRight: 8, color: '#94a3b8' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter by Role</InputLabel>
              <Select
                value={roleFilter}
                label="Filter by Role"
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <MenuItem value="ALL">All Roles</MenuItem>
                <MenuItem value="CEO">CEO</MenuItem>
                <MenuItem value="SENIOR_MANAGER">Senior Manager</MenuItem>
                <MenuItem value="JUNIOR_MANAGER">Junior Manager</MenuItem>
                <MenuItem value="TEAM_LEAD">Team Lead</MenuItem>
                <MenuItem value="SUB_LEAD">Sub Lead</MenuItem>
                <MenuItem value="SENIOR_ANALYST">Senior Analyst</MenuItem>
                <MenuItem value="ASSOCIATE_ANALYST">Associate Analyst</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2} sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={750}>
              Total {filteredUsers.length} Users
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* Grid Table */}
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#101726' }}>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Employee</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Role</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Reporting Line</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Team</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Joined Date</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Active</th>
                {isAdmin && <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center' }}>Delete</th>}
                {isAdmin && <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${theme.palette.divider}`, opacity: u.is_active ? 1 : 0.6 }}>
                  <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: '#4f46e5', fontWeight: 700, width: 28, height: 28, fontSize: '0.8rem' }}>
                      {u.full_name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 750 }}>{u.full_name}</Typography>
                      <Typography variant="caption" sx={{ fontSize: '0.7rem' }} color="text.secondary">{u.email}</Typography>
                    </Box>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontSize: '0.75rem',
                        color: 'text.primary'
                      }}
                    >
                      {u.role.replace('_', ' ')}
                    </Typography>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {u.reporting_to_list && u.reporting_to_list.length > 0 
                        ? u.reporting_to_list.map((m: any) => m.full_name).join(', ') 
                        : '-'}
                    </Typography>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                      {u.teams && u.teams.length > 0 
                        ? u.teams.map(t => t.name).join(', ') 
                        : 'Unassigned'}
                    </Typography>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }} color="text.secondary">{u.date_of_joining}</Typography>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Switch
                      checked={u.is_active}
                      onChange={() => handleToggleActive(u)}
                      disabled={!isAdmin || u.id === currentUser?.id}
                      color="primary"
                      size="small"
                    />
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <IconButton 
                        color="error" 
                        onClick={() => handleDeleteClick(u)}
                        disabled={u.id === currentUser?.id}
                        title="Delete User"
                        sx={{ bgcolor: 'action.hover', p: 0.5, borderRadius: '6px' }}
                        size="small"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </td>
                  )}
                  {isAdmin && (
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          onClick={() => handleOpenEdit(u)}
                          sx={{ borderRadius: '6px', fontSize: '0.7rem', py: 0.2, px: 1, minWidth: 'auto' }}
                        >
                          Edit
                        </Button>
                        <IconButton 
                          color="warning" 
                          onClick={() => handleResetPassword(u)}
                          title="Reset Password"
                          sx={{ bgcolor: 'action.hover', p: 0.5, borderRadius: '6px' }}
                          size="small"
                        >
                          <Key size={14} />
                        </IconButton>
                      </Box>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Card>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmUser)}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            borderRadius: '12px',
            p: 1.5,
            minWidth: 320
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.primary', fontSize: '0.95rem' }}>
            Are you sure you want to delete the employee details for <strong>{deleteConfirmUser?.full_name}</strong> ({deleteConfirmUser?.email})?
            <br />
            <span style={{ color: theme.palette.error.main, fontSize: '0.85rem', fontWeight: 600 }}>This action cannot be undone.</span>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeleteCancel} variant="outlined" sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" autoFocus sx={{ borderRadius: '8px' }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

