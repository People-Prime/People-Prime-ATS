import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Card, 
  CardContent,
  Typography, 
  Button, 
  TextField, 
  Grid,
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Alert,
  IconButton
} from '@mui/material';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { InputAdornment } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { addUser, updateUserInList } from '../redux/usersSlice';
import { User, UserRole } from '../types';
import { api } from '../services/api';

interface TeamOption {
  id: number;
  name: string;
}

interface DbUser {
  email: string;
  full_name: string;
  role: string;
}

export const CreateEditUser: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const { users } = useAppSelector(state => state.users);

  // Real teams fetched from backend
  const [teams, setTeams] = useState<TeamOption[]>([]);
  // Real managers fetched from backend (used for reporting_to dropdown)
  const [dbManagers, setDbManagers] = useState<DbUser[]>([]);

  useEffect(() => {
    api.get('teams/').then(res => {
      setTeams(res.data?.results ?? res.data ?? []);
    }).catch(() => {
      setTeams([{ id: 3, name: 'Alpha Core Dev' }, { id: 4, name: 'Beta Solutions' }]);
    });

    // Fetch real users from backend for the Reporting Manager dropdown
    api.get('users/').then(res => {
      const allUsers: DbUser[] = res.data?.results ?? res.data ?? [];
      // All active users can be selected as a reporting manager
      setDbManagers(allUsers);
    }).catch(() => {
      // Silently fail — dropdown will just be empty
    });
  }, []);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'ASSOCIATE_ANALYST' as UserRole,
    reportingToId: '',
    teamId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Find user if in edit mode
  const editingUser = userId ? users.find(u => u.id === userId) : null;

  useEffect(() => {
    if (userId && !editingUser) {
      setError('User not found.');
    } else if (editingUser) {
      setFormData({
        name: editingUser.full_name,
        email: editingUser.email,
        role: editingUser.role,
        reportingToId: editingUser.reporting_to?.email || editingUser.reporting_to?.id || '',
        teamId: editingUser.team?.id || '',
        joiningDate: editingUser.date_of_joining,
        password: '',
        confirmPassword: ''
      });
    }
  }, [userId, editingUser]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.email) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!editingUser) {
      if (!formData.password) {
        setError('Please set a password for the new employee.');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    // Resolve reporting manager object
    // Resolve mock team object

    const payload: Record<string, any> = {
      email: formData.email,
      full_name: formData.name,
      role: formData.role,
      date_of_joining: formData.joiningDate,
    };

    if (formData.reportingToId) {
      payload.reporting_to_id = formData.reportingToId;
    } else {
      payload.reporting_to_id = null;
    }

    if (formData.teamId) {
      const team = teams.find(t => String(t.id) === formData.teamId);
      if (team) {
        payload.team_id = team.id;
      } else {
        payload.team_id = null;
      }
    } else {
      payload.team_id = null;
    }

    if (editingUser) {
      // ── EDIT USER FLOW (Persist to Backend DB) ──
      setSubmitting(true);
      try {
        await api.put(`users/${editingUser.id}/`, payload);
        const selectedMgr = dbManagers.find(m => m.email === formData.reportingToId);
        const selectedTeam = teams.find(t => String(t.id) === formData.teamId);
        const updatedUser: User = {
          ...editingUser,
          full_name: formData.name,
          email: formData.email,
          role: formData.role,
          reporting_to: selectedMgr ? {
            id: selectedMgr.email,
            full_name: selectedMgr.full_name,
            email: selectedMgr.email,
            role: selectedMgr.role as UserRole
          } : null,
          team: selectedTeam ? { id: String(selectedTeam.id), name: selectedTeam.name } : null,
          date_of_joining: formData.joiningDate
        };
        dispatch(updateUserInList(updatedUser));
        setSuccess(`User profile for ${formData.name} has been updated successfully!`);
        setTimeout(() => navigate('/users'), 1500);
      } catch (err: any) {
        const data = err.response?.data;
        let detail = 'Failed to update employee profile. Please try again.';
        if (data) {
          detail = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
        }
        setError(detail);
      } finally {
        setSubmitting(false);
      }

    } else {
      // ── CREATE USER FLOW — POST to Django DB so login works ──
      const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase());
      if (emailExists) {
        setError('An employee with this email address already exists.');
        return;
      }

      setSubmitting(true);
      try {
        const payload: Record<string, any> = {
          email: formData.email,
          full_name: formData.name,
          role: formData.role,
          password: formData.password,
          date_of_joining: formData.joiningDate,
        };

        // reporting_to_id = the selected manager's email (real DB PK)
        if (formData.reportingToId) {
          payload.reporting_to_id = formData.reportingToId; // already is email from dbManagers
        }

        // team_id = real integer DB id
        if (formData.teamId) {
          const team = teams.find(t => String(t.id) === formData.teamId);
          if (team) payload.team_id = team.id;
        }

        await api.post('users/', payload);

        // Mirror into Redux so the user appears in View All Staff immediately
        const selectedMgr = dbManagers.find(m => m.email === formData.reportingToId);
        const selectedTeam = teams.find(t => String(t.id) === formData.teamId);
        const newUser: User = {
          id: formData.email,
          email: formData.email,
          full_name: formData.name,
          role: formData.role,
          reporting_to: selectedMgr ? {
            id: selectedMgr.email,
            full_name: selectedMgr.full_name,
            email: selectedMgr.email,
            role: selectedMgr.role as UserRole
          } : null,
          team: selectedTeam ? { id: String(selectedTeam.id), name: selectedTeam.name } : null,
          date_of_joining: formData.joiningDate,
          is_active: true,
          must_change_password: true
        };
        dispatch(addUser(newUser));

        setSuccess(
          `✅ Employee "${formData.name}" created in the system! ` +
          `They can log in with Email: ${formData.email} using the password you set.`
        );
        setTimeout(() => navigate('/users'), 2500);

      } catch (err: any) {
        const data = err.response?.data;
        let detail = 'Failed to create employee. Please try again.';
        if (data) {
          if (typeof data === 'string') detail = data;
          else if (data.detail) detail = data.detail;
          else {
            const fieldErrors = Object.entries(data)
              .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs[0] : msgs}`)
              .join(' | ');
            if (fieldErrors) detail = fieldErrors;
          }
        }
        setError(detail);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <Box sx={{ pb: 6, maxWidth: 800, mx: 'auto' }}>
      {/* Title */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Button
            variant="text"
            startIcon={<ArrowLeft size={16} />}
            onClick={() => navigate('/users')}
            sx={{ mb: 1, p: 0, '&:hover': { background: 'transparent' }, minWidth: 'auto', textTransform: 'none', color: 'text.secondary' }}
          >
            Back to User Directory
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {editingUser ? 'Modify Employee Profile' : 'Onboard New Employee'}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {editingUser ? 'Update contact details, team assignment, and organizational reporting lines.' : 'Provide details below to provision a new corporate employee profile.'}
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }}>
          {success}
        </Alert>
      )}

      <Card sx={{ borderRadius: '16px', border: `1px solid ${theme.palette.divider}`, boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <form onSubmit={handleSaveUser}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Full Name"
                  required
                  fullWidth
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  size="small"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email Address"
                  required
                  type="email"
                  fullWidth
                  disabled={editingUser !== null}
                  placeholder="name@peopleprimeats.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  size="small"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Date of Joining"
                  type="date"
                  required
                  fullWidth
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Organizational Role</InputLabel>
                  <Select
                    value={formData.role}
                    label="Organizational Role"
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  >
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

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Reporting Manager</InputLabel>
                  <Select
                    value={formData.reportingToId}
                    label="Reporting Manager"
                    onChange={(e) => setFormData({ ...formData, reportingToId: e.target.value })}
                  >
                    <MenuItem value="">None / Executive Level</MenuItem>
                    {(dbManagers.length > 0 ? dbManagers : users)
                      .filter(u => ((u as any).email || (u as any).id) !== editingUser?.email)
                      .map(mgr => {
                        const val = (mgr as any).email || (mgr as any).id;
                        return (
                          <MenuItem key={val} value={val}>
                            {mgr.full_name} ({mgr.role.replace('_', ' ')})
                          </MenuItem>
                        );
                      })}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Assign Team</InputLabel>
                  <Select
                    value={formData.teamId}
                    label="Assign Team"
                    onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                  >
                    <MenuItem value="">Unassigned</MenuItem>
                    {teams.map(team => (
                      <MenuItem key={team.id} value={String(team.id)}>{team.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Password fields — only shown when creating a new employee */}
              {!editingUser && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Set Password"
                      required
                      fullWidth
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      size="small"
                      helperText="Minimum 8 characters"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Confirm Password"
                      required
                      fullWidth
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      size="small"
                      error={formData.confirmPassword !== '' && formData.password !== formData.confirmPassword}
                      helperText={formData.confirmPassword !== '' && formData.password !== formData.confirmPassword ? 'Passwords do not match' : ' '}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end">
                              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ borderRadius: '8px', fontSize: '0.85rem' }}>
                      📧 Upon creation, the employee's login credentials (email & password) will be automatically emailed to them. They will be required to change their password on first login.
                    </Alert>
                  </Grid>
                </>
              )}

              <Grid item xs={12} sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 1 }}>
                <Button 
                  variant="outlined"
                  onClick={() => navigate('/users')}
                  sx={{ py: 1, px: 3, borderRadius: '8px', fontWeight: 600 }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="contained" 
                  color="primary"
                  disabled={submitting}
                  sx={{ py: 1, px: 4, borderRadius: '8px', fontWeight: 700 }}
                >
                  {submitting ? 'Processing...' : (editingUser ? 'Save Changes' : 'Onboard Employee')}
                </Button>
              </Grid>
            </Grid>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CreateEditUser;
