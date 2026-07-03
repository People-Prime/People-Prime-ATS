import React, { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Card,
  Typography, 
  Button, 
  Avatar, 
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  CircularProgress,
  Divider,
  Chip,
  Checkbox,
  ListItemText
} from '@mui/material';
import { 
  Plus, 
  Users, 
  Trash2,
  X
} from 'lucide-react';
import { Team, User } from '../types';
import { api } from '../services/api';
import { useAppSelector } from '../redux/store';

export const TeamManagement: React.FC = () => {
  const theme = useTheme();
  const { user: currentUser } = useAppSelector(state => state.auth);

  const [teams, setTeams] = useState<Team[]>([]);
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // States for create/edit team dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
    leadId: '',
    memberIds: [] as string[]
  });

  // State for members viewer dialog
  const [membersDialog, setMembersDialog] = useState<{ open: boolean; teamName: string; members: User[] }>({
    open: false,
    teamName: '',
    members: []
  });

  const fetchTeamsAndUsers = async () => {
    try {
      setLoading(true);
      const teamsRes = await api.get('teams/');
      const usersRes = await api.get('users/');
      
      const fetchedTeams = (teamsRes.data?.results ?? teamsRes.data ?? []).map((t: any) => ({
        id: String(t.id),
        name: t.name,
        description: t.description,
        team_lead: t.team_lead ? {
          id: t.team_lead.email,
          full_name: t.team_lead.full_name,
          email: t.team_lead.email
        } : null,
        members_count: t.members_count || 0
      }));

      setTeams(fetchedTeams);
      setDbUsers(usersRes.data?.results ?? usersRes.data ?? []);
    } catch (err) {
      console.error("Failed to fetch teams/users", err);
      // Fallback mock data in case API fails
      setTeams([
        {
          id: 'team_alpha',
          name: 'Alpha Core Dev',
          description: 'Responsible for core React dashboard widgets and frontend performance tuning.',
          team_lead: {
            id: 'usr_tl',
            full_name: 'David Miller',
            email: 'david.miller@peopleprimeats.com'
          },
          members_count: 3
        },
        {
          id: 'team_beta',
          name: 'Beta Solutions',
          description: 'Handles client integrations, database deployments, and AWS cloud management.',
          team_lead: {
            id: 'usr_tl_beta',
            full_name: 'Bruce Wayne',
            email: 'bruce.wayne@peopleprimeats.com'
          },
          members_count: 3
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamsAndUsers();
  }, []);

  const teamLeads = dbUsers.filter(u => 
    ['TEAM_LEAD', 'SUB_LEAD', 'JUNIOR_MANAGER', 'SENIOR_MANAGER', 'CEO'].includes(u.role) && u.is_active
  );

  const handleOpenCreate = () => {
    setEditingTeam(null);
    setTeamForm({
      name: '',
      description: '',
      leadId: teamLeads[0]?.email || '',
      memberIds: []
    });
    setOpenDialog(true);
  };

  const handleOpenEdit = (team: Team) => {
    setEditingTeam(team);
    const currentMembers = dbUsers
      .filter(u => u.teams && u.teams.some(t => String(t.id) === String(team.id)))
      .map(u => u.email);
    setTeamForm({
      name: team.name,
      description: team.description,
      leadId: team.team_lead?.email || '',
      memberIds: currentMembers
    });
    setOpenDialog(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamForm.name) return;

    const payload = {
      name: teamForm.name,
      description: teamForm.description,
      team_lead_id: teamForm.leadId || null,
      member_ids: teamForm.memberIds
    };

    try {
      if (editingTeam) {
        await api.put(`teams/${editingTeam.id}/`, payload);
      } else {
        await api.post('teams/', payload);
      }
      fetchTeamsAndUsers();
      setOpenDialog(false);
    } catch (err) {
      alert("Failed to save team. Please try again.");
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await api.delete(`teams/${id}/`);
        fetchTeamsAndUsers();
      } catch (err) {
        alert("Failed to delete team.");
      }
    }
  };

  const handleOpenMembers = (team: Team, membersList: User[]) => {
    setMembersDialog({ open: true, teamName: team.name, members: membersList });
  };

  const handleCloseMembers = () => {
    setMembersDialog({ open: false, teamName: '', members: [] });
  };

  // Role badge color helper
  const getRoleColor = (role: string) => {
    const map: Record<string, string> = {
      TEAM_LEAD: '#0d9488',
      SUB_LEAD: '#7c3aed',
      SENIOR_ANALYST: '#059669',
      ASSOCIATE_ANALYST: '#2563eb',
      JUNIOR_MANAGER: '#d97706',
      SENIOR_MANAGER: '#dc2626',
      CEO: '#1e293b',
    };
    return map[role] || '#64748b';
  };

  if (loading && teams.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const visibleTeams = teams.filter(team => {
    if (currentUser?.role !== 'SENIOR_MANAGER') return true;
    if (!team.team_lead) return false;
    const leadUser = dbUsers.find(u => u.email?.toLowerCase() === team.team_lead?.email?.toLowerCase());
    return leadUser && leadUser.reporting_to && leadUser.reporting_to.email?.toLowerCase() === currentUser?.email?.toLowerCase();
  });

  return (
    <Box sx={{ pb: 6 }}>
      {/* Title */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Team Management
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Configure technical consulting teams, assign Team Leads, and organize associates.
          </Typography>
        </Box>
        {currentUser?.role !== 'SENIOR_MANAGER' && (
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={handleOpenCreate}
            sx={{ borderRadius: '8px' }}
          >
            Create Team
          </Button>
        )}
      </Box>

      {/* Flat Table */}
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#101726' }}>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Team</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Description</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Team Leader</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Members</th>
                {currentUser?.role === 'ADMIN' && (
                  <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center' }}>Delete</th>
                )}
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map((team) => {
                const teamMembersList = dbUsers.filter(u => u.teams && u.teams.some(t => String(t.id) === String(team.id)));
                return (
                  <tr key={team.id} style={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                    {/* Team Name */}
                    <td style={{ padding: '6px 8px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', fontWeight: 700, width: 28, height: 28, fontSize: '0.8rem' }}>
                          {team.name.charAt(0)}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 750 }}>{team.name}</Typography>
                      </Box>
                    </td>
                    {/* Description */}
                    <td style={{ padding: '6px 8px', maxWidth: 260 }}>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.75rem' }}>
                        {team.description || 'No description provided.'}
                      </Typography>
                    </td>
                    {/* Team Leader */}
                    <td style={{ padding: '6px 8px' }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {team.team_lead?.full_name || 'No lead assigned'}
                      </Typography>
                    </td>
                    {/* Members — clickable */}
                    <td style={{ padding: '6px 8px' }}>
                      <Box
                        onClick={() => handleOpenMembers(team, teamMembersList)}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          cursor: teamMembersList.length > 0 ? 'pointer' : 'default',
                          px: 1,
                          py: 0.3,
                          borderRadius: '6px',
                          border: teamMembersList.length > 0 ? `1px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                          color: teamMembersList.length > 0 ? 'primary.main' : 'text.secondary',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          transition: 'all 0.15s ease',
                          '&:hover': teamMembersList.length > 0 ? {
                            bgcolor: 'primary.main',
                            color: 'white',
                          } : {}
                        }}
                      >
                        <Users size={13} />
                        {teamMembersList.length}
                      </Box>
                    </td>
                    {/* Delete */}
                    {currentUser?.role === 'ADMIN' && (
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteTeam(team.id)}
                          title="Delete Team"
                          sx={{ bgcolor: 'action.hover', p: 0.5, borderRadius: '6px' }}
                          size="small"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </td>
                    )}
                    {/* Actions */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleOpenEdit(team)}
                        sx={{ borderRadius: '6px', fontSize: '0.7rem', py: 0.2, px: 1, minWidth: 'auto' }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    <Typography variant="body2">No teams found. Create your first team.</Typography>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Card>

      {/* ========================================================
          MEMBERS VIEWER DIALOG
          ======================================================== */}
      <Dialog
        open={membersDialog.open}
        onClose={handleCloseMembers}
        PaperProps={{
          sx: { borderRadius: '16px', minWidth: '440px', maxWidth: '540px', p: 0, overflow: 'hidden' }
        }}
      >
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 3,
          py: 2,
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #4f46e5 0%, #0d9488 100%)'
            : 'linear-gradient(135deg, #3730a3 0%, #0f766e 100%)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Users size={20} color="white" />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'white', lineHeight: 1.2 }}>
                {membersDialog.teamName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                {membersDialog.members.length} member{membersDialog.members.length !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={handleCloseMembers} size="small" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
            <X size={18} />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0 }}>
          {membersDialog.members.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
              <Users size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2">No members assigned to this team.</Typography>
            </Box>
          ) : (
            <Box>
              {membersDialog.members.map((member, idx) => (
                <React.Fragment key={member.id}>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 3,
                    py: 1.5,
                    transition: 'background 0.15s',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700 }}>
                      {member.full_name.charAt(0)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                        {member.full_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        {member.email}
                      </Typography>
                    </Box>
                    <Chip
                      label={member.role.replace(/_/g, ' ')}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        height: 22,
                        bgcolor: getRoleColor(member.role) + '18',
                        color: getRoleColor(member.role),
                        border: `1px solid ${getRoleColor(member.role)}40`,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}
                    />
                  </Box>
                  {idx < membersDialog.members.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleCloseMembers} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================
          CREATE / EDIT TEAM DIALOG
          ======================================================== */}
      <Dialog 
        open={openDialog} 
        onClose={() => setOpenDialog(false)}
        PaperProps={{
          sx: { borderRadius: '16px', minWidth: '400px', p: 1 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingTeam ? 'Edit Team Configuration' : 'Create New Team'}
        </DialogTitle>
        <form onSubmit={handleSaveTeam}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              label="Team Name"
              required
              fullWidth
              value={teamForm.name}
              onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              placeholder="e.g., Gamma Cloud Services"
              size="small"
            />
            <TextField
              label="Description / Purpose"
              fullWidth
              multiline
              rows={3}
              value={teamForm.description}
              onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
              placeholder="e.g., Focuses on Kubernetes deployments and GCP architect designs..."
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Assign Team Leader</InputLabel>
              <Select
                value={teamForm.leadId}
                label="Assign Team Leader"
                onChange={(e) => setTeamForm({ ...teamForm, leadId: e.target.value })}
              >
                <MenuItem value="">No Lead / Unassigned</MenuItem>
                {teamLeads.map(lead => (
                  <MenuItem key={lead.email} value={lead.email}>
                    {lead.full_name} ({lead.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Assign Team Members</InputLabel>
              <Select
                multiple
                value={teamForm.memberIds}
                label="Assign Team Members"
                onChange={(e) => {
                  const val = e.target.value;
                  setTeamForm({ 
                    ...teamForm, 
                    memberIds: typeof val === 'string' ? val.split(',') : val 
                  });
                }}
                renderValue={(selected) => {
                  const selectedNames = dbUsers
                    .filter(u => selected.includes(u.email))
                    .map(u => u.full_name);
                  return selectedNames.join(', ');
                }}
              >
                {dbUsers
                  .filter(u => u.is_active && u.role !== 'ADMIN')
                  .map(usr => {
                    const isChecked = teamForm.memberIds.indexOf(usr.email) > -1;
                    return (
                      <MenuItem key={usr.email} value={usr.email}>
                        <Checkbox checked={isChecked} size="small" />
                        <ListItemText primary={`${usr.full_name} (${usr.role.replace('_', ' ')})`} />
                      </MenuItem>
                    );
                  })}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOpenDialog(false)} variant="outlined" sx={{ borderRadius: '8px' }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary" sx={{ borderRadius: '8px' }}>
              Save Team
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

