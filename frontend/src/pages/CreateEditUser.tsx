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
  IconButton,
  Checkbox,
  ListItemText
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
    reportingToIds: [] as string[],
    teamIds: [] as string[],
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
      const repIds = editingUser.reporting_to_list ? editingUser.reporting_to_list.map((r: any) => r.email || r.id) : [];
      const tIds = editingUser.teams ? editingUser.teams.map((t: any) => String(t.id)) : [];
      setFormData({
        name: editingUser.full_name,
        email: editingUser.email,
        role: editingUser.role,
        reportingToIds: repIds,
        teamIds: tIds,
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

    if (formData.reportingToIds.length > 0) {
      payload.reporting_to_ids = formData.reportingToIds;
    } else {
      payload.reporting_to_ids = [];
    }

    if (formData.teamIds.length > 0) {
      payload.team_ids = formData.teamIds.map(Number);
    } else {
      payload.team_ids = [];
    }

    if (editingUser) {
      // ── EDIT USER FLOW (Persist to Backend DB) ──
      setSubmitting(true);
      try {
        await api.put(`users/${editingUser.id}/`, payload);
        const selectedManagers = dbManagers.filter(m => formData.reportingToIds.includes(m.email));
        const selectedTeams = teams.filter(t => formData.teamIds.includes(String(t.id)));
        const updatedUser: User = {
          ...editingUser,
          full_name: formData.name,
          email: formData.email,
          role: formData.role,
          reporting_to: selectedManagers.length > 0 ? {
            id: selectedManagers[0].email,
            full_name: selectedManagers[0].full_name,
            email: selectedManagers[0].email,
            role: selectedManagers[0].role as UserRole
          } : null,
          reporting_to_list: selectedManagers.map(m => ({
            id: m.email,
            full_name: m.full_name,
            email: m.email,
            role: m.role as UserRole
          })),
          team: selectedTeams.length > 0 ? { id: String(selectedTeams[0].id), name: selectedTeams[0].name } : null,
          teams: selectedTeams.map(t => ({ id: String(t.id), name: t.name })),
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
        const createPayload: Record<string, any> = {
          email: formData.email,
          full_name: formData.name,
          role: formData.role,
          password: formData.password,
          date_of_joining: formData.joiningDate,
        };

        if (formData.reportingToIds.length > 0) {
          createPayload.reporting_to_ids = formData.reportingToIds;
        } else {
          createPayload.reporting_to_ids = [];
        }

        if (formData.teamIds.length > 0) {
          createPayload.team_ids = formData.teamIds.map(Number);
        } else {
          createPayload.team_ids = [];
        }

        await api.post('users/', createPayload);

        // Mirror into Redux so the user appears in View All Staff immediately
        const selectedManagers = dbManagers.filter(m => formData.reportingToIds.includes(m.email));
        const selectedTeams = teams.filter(t => formData.teamIds.includes(String(t.id)));
        const newUser: User = {
          id: formData.email,
          email: formData.email,
          full_name: formData.name,
          role: formData.role,
          reporting_to: selectedManagers.length > 0 ? {
            id: selectedManagers[0].email,
            full_name: selectedManagers[0].full_name,
            email: selectedManagers[0].email,
            role: selectedManagers[0].role as UserRole
          } : null,
          reporting_to_list: selectedManagers.map(m => ({
            id: m.email,
            full_name: m.full_name,
            email: m.email,
            role: m.role as UserRole
          })),
          team: selectedTeams.length > 0 ? { id: String(selectedTeams[0].id), name: selectedTeams[0].name } : null,
          teams: selectedTeams.map(t => ({ id: String(t.id), name: t.name })),
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
                    <MenuItem value="REPORTING_TEAM">Reporting Team</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Reporting Managers</InputLabel>
                  <Select
                    multiple
                    value={formData.reportingToIds}
                    label="Reporting Managers"
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ 
                        ...formData, 
                        reportingToIds: typeof val === 'string' ? val.split(',') : val 
                      });
                    }}
                    renderValue={(selected) => {
                      const selectedNames = (dbManagers.length > 0 ? dbManagers : users)
                        .filter(m => selected.includes((m as any).email || (m as any).id))
                        .map(m => m.full_name);
                      return selectedNames.join(', ');
                    }}
                  >
                    {(dbManagers.length > 0 ? dbManagers : users)
                      .filter(u => ((u as any).email || (u as any).id) !== editingUser?.email)
                      .map(mgr => {
                        const val = (mgr as any).email || (mgr as any).id;
                        const isChecked = formData.reportingToIds.indexOf(val) > -1;
                        return (
                          <MenuItem key={val} value={val}>
                            <Checkbox checked={isChecked} size="small" />
                            <ListItemText primary={`${mgr.full_name} (${mgr.role.replace('_', ' ')})`} />
                          </MenuItem>
                        );
                      })}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Assign Teams</InputLabel>
                  <Select
                    multiple
                    value={formData.teamIds}
                    label="Assign Teams"
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ 
                        ...formData, 
                        teamIds: typeof val === 'string' ? val.split(',') : val 
                      });
                    }}
                    renderValue={(selected) => {
                      const selectedNames = teams
                        .filter(t => selected.includes(String(t.id)))
                        .map(t => t.name);
                      return selectedNames.join(', ');
                    }}
                  >
                    {teams.map(team => {
                      const val = String(team.id);
                      const isChecked = formData.teamIds.indexOf(val) > -1;
                      return (
                        <MenuItem key={team.id} value={val}>
                          <Checkbox checked={isChecked} size="small" />
                          <ListItemText primary={team.name} />
                        </MenuItem>
                      );
                    })}
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
