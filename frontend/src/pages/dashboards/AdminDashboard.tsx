import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Card,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Button,
  Divider,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton
} from '@mui/material';
import { ShieldCheck, Plus, X, Building } from 'lucide-react';
import { useAppSelector } from '../../redux/store';
import { PipelineKPIs } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

const COLORS = ['#4f46e5', '#0d9488', '#f59e0b', '#ef4444', '#10b981', '#06b6d4', '#8b5cf6'];

export const AdminDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  const recentCreations = [...users]
    .sort((a, b) => new Date(b.date_of_joining).getTime() - new Date(a.date_of_joining).getTime())
    .slice(0, 4);

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogData, setDialogData] = useState<any[]>([]);
  const [dialogTitle, setDialogTitle] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  const getRemarkField = (remarks: string | undefined, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const lines = remarks.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().startsWith(fieldName.toLowerCase() + ':')) {
        return line.slice(fieldName.length + 1).trim();
      }
    }
    return 'N/A';
  };

  const handleTeamMetricClick = (teamId: string, teamName: string, status: string) => {
    const teamMembers = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(teamId)));
    let teamApps = applications.filter(app =>
      app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
    );

    // Apply date filter if not showAllTimeKPIs
    if (selectedDate && !showAllTimeKPIs) {
      teamApps = teamApps.filter(app => {
        const d = app.updated_at || app.created_at || '';
        return d.slice(0, 10) === selectedDate;
      });
    }

    if (status !== 'ALL') {
      if (status === 'HAS_CANDIDATE') teamApps = teamApps.filter(a => a.candidate_name);
      else if (status === 'INTERVIEWS') teamApps = teamApps.filter(a => a.status === 'Interview Scheduled' || a.status === 'Interview Completed');
      else teamApps = teamApps.filter(a => a.status === status);
    }

    let title = `Applications for Team ${teamName}`;
    if (status !== 'ALL' && status !== 'HAS_CANDIDATE' && status !== 'INTERVIEWS') title += ` - ${status}`;
    else if (status === 'HAS_CANDIDATE') title += ' - Submissions';
    else if (status === 'INTERVIEWS') title += ' - Client Interviews';
    else title += ' - Assigned Jobs';

    setDialogTitle(title);
    setDialogData(teamApps);
    setOpenDialog(true);
  };

  const renderTeamMetric = (value: number, teamId: string, teamName: string, status: string) => {
    if (value === 0) return <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>0</Typography>;
    return (
      <Typography
        variant="body2"
        sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { color: 'primary.dark', textDecoration: 'underline' } }}
        onClick={() => handleTeamMetricClick(teamId, teamName, status)}
      >
        {value}
      </Typography>
    );
  };

  // Filter all org-wide applications by selected date
  const dateFilteredApps = selectedDate
    ? applications.filter(app => {
      const d = app.updated_at || app.created_at || '';
      return d.slice(0, 10) === selectedDate;
    })
    : applications;

  return (
    <Box>
      {/* Title greeting */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: -0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is what's happening with the Application Tracking System today.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant={showAllTimeKPIs ? "contained" : "outlined"}
            size="small"
            onClick={() => setShowAllTimeKPIs(!showAllTimeKPIs)}
            sx={{ borderRadius: '8px', fontSize: '0.75rem', py: 0.5, fontWeight: 700 }}
          >
            {showAllTimeKPIs ? "All-Time KPIs Active" : "Show All-Time KPIs"}
          </Button>
          <DashboardCalendar
            selectedDate={selectedDate}
            onChange={setSelectedDate}
            totalCount={dateFilteredApps.length}
            allCount={applications.length}
          />
          {currentUser?.role !== 'CEO' && (
            <Button
              variant="outlined"
              onClick={() => navigate('/teams')}
              startIcon={<ShieldCheck size={18} />}
              sx={{ borderRadius: '8px', fontWeight: 700 }}
            >
              Manage Teams
            </Button>
          )}
          {currentUser?.role !== 'CEO' && (
            <Button
              variant="contained"
              onClick={() => navigate('/users/create')}
              startIcon={<Plus size={18} />}
              sx={{ borderRadius: '8px', fontWeight: 750 }}
            >
              Onboard Employee
            </Button>
          )}
        </Box>
      </Box>


      {/* Pipeline KPIs – org-wide counts filtered by date or all-time */}
      <PipelineKPIs applications={showAllTimeKPIs ? applications : dateFilteredApps} />

      {/* CEO Hierarchy Report – full org tree */}
      {currentUser?.role === 'CEO' && <HierarchyReport />}

      {/* Senior Manager Hierarchy Report – starts from their own node */}
      {currentUser?.role === 'SENIOR_MANAGER' && (
        <HierarchyReport rootEmail={currentUser.email} />
      )}

      {currentUser?.role === 'CEO' && (
        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <Card sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '12px', boxShadow: 'none' }}>
              <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                  Recruitment Activity - By Every Team
                </Typography>
              </Box>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '0.75rem' } }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#edf5fd' : '#1e293b' }}>
                      <TableCell sx={{ fontWeight: 800 }}>Team Name</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Assigned Jobs</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Submissions</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Pending Feedback</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Client Submissions</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Client Interviews</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Client Rejections</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Offers Sent</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Offers Accepted</TableCell>
                      <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Placed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      // Get unique teams from the users list
                      const uniqueTeams = Array.from(
                        new Map(
                          users
                            .flatMap(u => u.teams || [])
                            .filter(t => t && t.id)
                            .map(t => [String(t.id), t] as [string, any])
                        ).values()
                      );

                      if (uniqueTeams.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                              No active teams found.
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return uniqueTeams.map((team: any) => {
                        const teamMembers = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(team.id)));
                        let teamApps = applications.filter(app =>
                          app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
                        );

                        // Apply selectedDate filter if active
                        if (selectedDate && !showAllTimeKPIs) {
                          teamApps = teamApps.filter(app => {
                            const d = app.updated_at || app.created_at || '';
                            return d.slice(0, 10) === selectedDate;
                          });
                        }

                        const assigned = teamApps.length;
                        const subs = teamApps.filter(app => app.candidate_name).length;
                        const pending = teamApps.filter(app => app.status === 'Under Review').length;
                        const clientSubs = teamApps.filter(app => app.status === 'Submitted').length;
                        const ints = teamApps.filter(app => ['Interview Scheduled', 'Interview Completed'].includes(app.status)).length;
                        const rejections = teamApps.filter(app => app.status === 'Rejected').length;
                        const offers = teamApps.filter(app => app.status === 'On Hold').length;
                        const offerAcc = teamApps.filter(app => app.status === 'Selected').length;
                        const placed = teamApps.filter(app => app.status === 'Selected').length;

                        return (
                          <TableRow key={team.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            <TableCell sx={{ fontWeight: 650 }}>{team.name}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(assigned, team.id, team.name, 'ALL')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(subs, team.id, team.name, 'HAS_CANDIDATE')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(pending, team.id, team.name, 'Under Review')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(clientSubs, team.id, team.name, 'Submitted')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(ints, team.id, team.name, 'INTERVIEWS')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(rejections, team.id, team.name, 'Rejected')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(offers, team.id, team.name, 'On Hold')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(offerAcc, team.id, team.name, 'Selected')}</TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(placed, team.id, team.name, 'Selected')}</TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* CLICKABLE METRIC DRILL DOWN DIALOG */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>{dialogTitle}</Typography>
          <IconButton onClick={() => setOpenDialog(false)} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={{ width: '50px' }}></TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Job Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Position & Client</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  const groupedDialogApps: any[] = [];
                  const groups: Record<string, any[]> = {};
                  dialogData.forEach(app => {
                    const jobCode = getRemarkField(app.remarks, 'Job Code');
                    const isRequirement = !app.candidate_name || jobCode !== 'N/A';
                    if (!isRequirement) return;

                    const key = jobCode !== 'N/A' ? `${jobCode}|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}` : `nocode-${app.id}`;
                    if (!groups[key]) {
                      groups[key] = [];
                    }
                    groups[key].push(app);
                  });
                  Object.keys(groups).forEach(key => {
                    const group = groups[key];
                    const rep = { ...group[0] };
                    rep.associatedApps = group;
                    groupedDialogApps.push(rep);
                  });

                  return groupedDialogApps.map(app => {
                    const jobCodeVal = getRemarkField(app.remarks, 'Job Code');
                    const jobCodeKey = jobCodeVal !== 'N/A' ? `${jobCodeVal}|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}` : `nocode-${app.id}`;
                    const jobApplicants = dialogData.filter(a =>
                      a.candidate_name &&
                      (jobCodeVal !== 'N/A'
                        ? (getRemarkField(a.remarks, 'Job Code') === jobCodeVal && a.position?.toLowerCase() === app.position?.toLowerCase() && a.client_name?.toLowerCase() === app.client_name?.toLowerCase())
                        : (a.position?.toLowerCase() === app.position?.toLowerCase() && a.client_name?.toLowerCase() === app.client_name?.toLowerCase()))
                    );
                    const isExpanded = !!expandedJobs[jobCodeKey];

                    return (
                      <React.Fragment key={app.id}>
                        <TableRow>
                          <TableCell style={{ textAlign: 'center' }}>
                            <Box
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedJobs(prev => ({ ...prev, [jobCodeKey]: !prev[jobCodeKey] }));
                              }}
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                gap: 0.5,
                                userSelect: 'none'
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 900,
                                  color: 'primary.main',
                                  fontSize: '1rem',
                                  lineHeight: 1
                                }}
                              >
                                {isExpanded ? '−' : '+'}
                              </Typography>
                              <Box
                                sx={{
                                  bgcolor: 'primary.main',
                                  color: '#fff',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  px: 0.5,
                                  py: 0.1,
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 15,
                                  height: 15
                                }}
                              >
                                {jobApplicants.length}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>{jobCodeVal}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>{app.position}</Typography>
                            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                              <Building size={12} /> {app.client_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                              {app.status}
                            </Typography>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                            <TableCell colSpan={4} style={{ padding: '12px 16px' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
                                APPLICANTS ({jobApplicants.length})
                              </Typography>
                              {jobApplicants.length === 0 ? (
                                <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', py: 1 }}>
                                  No applicants have been sourced for this job requirement.
                                </Typography>
                              ) : (
                                <TableContainer sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '6px' }}>
                                  <Table size="small" sx={{ backgroundColor: theme.palette.background.paper }}>
                                    <TableHead>
                                      <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Applicant ID</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Applicant Name</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Email</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Job Code</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>City</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>State</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Applicant Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Job Title</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary }}>Created By</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', color: theme.palette.text.secondary, textAlign: 'center' }}>Actions</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {jobApplicants.map((applicant) => (
                                        <TableRow key={applicant.id}>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.id}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: theme.palette.primary.main }}>
                                            {applicant.candidate_name || 'N/A'}
                                          </TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.candidate_email || 'N/A'}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{getRemarkField(applicant.remarks, 'Job Code')}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.city || 'N/A'}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.state || 'N/A'}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: theme.palette.primary.main }}>{applicant.status}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.position}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem' }}>{applicant.recruiter || applicant.assigned_employee?.full_name || 'System'}</TableCell>
                                          <TableCell sx={{ fontSize: '0.7rem', textAlign: 'center' }}>
                                            <Typography
                                              variant="body2"
                                              sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/candidates/create/${applicant.id}`);
                                              }}
                                            >
                                              Edit
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
                {dialogData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>No data found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>

      {/* Recent User Creations - Hidden for CEO */}
      {currentUser?.role !== 'CEO' && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                  Recent Employee Onboardings
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => navigate('/users')}
                  sx={{ borderRadius: '8px', fontSize: '0.75rem', py: 0.25 }}
                >
                  View All Staff
                </Button>
              </Box>
              <List sx={{ py: 0 }}>
                {recentCreations.map((user, index) => (
                  <React.Fragment key={user.id}>
                    <ListItem sx={{ py: 0.5, px: 2 }}>
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: COLORS[index % COLORS.length], fontWeight: 700 }}>
                          {user.full_name.charAt(0)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>{user.full_name}</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.65rem' }}>
                              {user.role === 'CEO' ? 'CEO' : user.role.replace('_', ' ')}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.7rem' }}>
                            Joined on {new Date(user.date_of_joining).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} • {user.email}
                          </Typography>
                        }
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.75rem', color: user.is_active ? 'success.main' : 'text.secondary' }}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Typography>
                    </ListItem>
                    {index < recentCreations.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>

  );
};
