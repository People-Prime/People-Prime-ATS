import React, { useState, useMemo } from 'react';
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
  IconButton,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Chip
} from '@mui/material';
import { ShieldCheck, Plus, X, Building, Search, Users, Briefcase, Award, TrendingUp, Trash2 } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../../redux/store';
import { deleteApplication } from '../../redux/applicationsSlice';
import { api } from '../../services/api';
import { PipelineKPIs, getUniqueSubmissions } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

const getRemarkField = (remarks: string | undefined | null, fieldName: string): string => {
  if (!remarks) return 'N/A';
  const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
  const value = match ? match[1].trim() : 'N/A';
  const cleanVal = value && value !== '' ? value : 'N/A';
  if (fieldName === 'Job Code' && cleanVal !== 'N/A') {
    if (!cleanVal.toUpperCase().startsWith('PPW')) {
      return 'N/A';
    }
  }
  return cleanVal;
};

const getUniqueJobsList = (apps: any[]): any[] => {
  const seenKeys = new Set<string>();
  const uniqueJobs: any[] = [];
  apps.forEach(app => {
    const jobCode = getRemarkField(app.remarks, 'Job Code');
    if (jobCode === 'N/A' || !jobCode) return;
    const key = jobCode.toUpperCase().trim();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueJobs.push(app);
    }
  });
  return uniqueJobs;
};

const getUniqueCandidatesList = (apps: any[]): any[] => {
  const seenKeys = new Set<string>();
  const uniqueCandidates: any[] = [];
  apps.forEach(app => {
    if (!app.candidate_name) return;
    const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueCandidates.push(app);
    }
  });
  return uniqueCandidates;
};

const COLORS = ['#4f46e5', '#0d9488', '#f59e0b', '#ef4444', '#10b981', '#06b6d4', '#8b5cf6'];

interface AdminDashboardProps {
  readOnly?: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ readOnly = false }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);
  const deduplicatedApps = getUniqueSubmissions(applications);
  const dispatch = useAppDispatch();

  const handleDeleteSubmission = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the submission for "${name}"?`)) {
      try {
        await api.delete(`applications/${id}/`);
        dispatch(deleteApplication(id));
      } catch (err) {
        alert("Failed to delete record.");
      }
    }
  };

  const handleDeleteJobGroup = async (group: any[], position: string) => {
    if (window.confirm(`Are you sure you want to delete the job requirement "${position}" and all of its ${group.length} candidate submissions?`)) {
      try {
        for (const app of group) {
          await api.delete(`applications/${app.id}/`);
          dispatch(deleteApplication(String(app.id)));
        }
      } catch (err) {
        alert("Failed to delete some records.");
      }
    }
  };

  const recentCreations = [...users]
    .sort((a, b) => new Date(b.date_of_joining).getTime() - new Date(a.date_of_joining).getTime())
    .slice(0, 4);

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogData, setDialogData] = useState<any[]>([]);
  const [dialogTitle, setDialogTitle] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  // Tab control and search states
  const [activeTab, setActiveTab] = useState(0);
  const [applicantsSearch, setApplicantsSearch] = useState('');
  const [jobsSearch, setJobsSearch] = useState('');
  const [placementsSearch, setPlacementsSearch] = useState('');
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});
  const [expandedGroupedJobs, setExpandedGroupedJobs] = useState<Record<string, boolean>>({});

  // Helper to extract numeric profit based on rates
  const getProfitAmount = (remarks: string) => {
    const grossStr = getRemarkField(remarks, 'Client Bill Rate');
    const invStr = getRemarkField(remarks, 'Pay Rate');
    const extractNumber = (s: string) => {
      const cleaned = s.replace(/[^0-9.]/g, '');
      return cleaned ? parseFloat(cleaned) : NaN;
    };
    const grossNum = extractNumber(grossStr);
    const invNum = extractNumber(invStr);
    if (!isNaN(grossNum) && !isNaN(invNum)) {
      const diff = grossNum - invNum;
      const currency = grossStr.includes('LPA') ? ' LPA' : (grossStr.includes('$') ? '$' : '');
      if (currency === ' LPA') {
        return `${diff.toFixed(1)}${currency}`;
      } else if (currency === '$') {
        return `$${diff.toFixed(1)}`;
      }
      return `${diff.toFixed(1)}`;
    }
    return 'N/A';
  };

  // 1. APPLICANTS DATA PREPARATION (from all teams)
  const displayApplicants = useMemo(() => {
    // Applicants are applications with a candidate name
    const apps = deduplicatedApps.filter(app => app.candidate_name);

    // Filter by search term
    const filtered = apps.filter(app => {
      if (!applicantsSearch) return true;
      const term = applicantsSearch.toLowerCase();
      return (
        (app.candidate_name || '').toLowerCase().includes(term) ||
        (app.candidate_email || '').toLowerCase().includes(term) ||
        (app.client_name || '').toLowerCase().includes(term) ||
        (app.position || '').toLowerCase().includes(term) ||
        (app.technology || '').toLowerCase().includes(term) ||
        getRemarkField(app.remarks, 'Job Code').toLowerCase().includes(term)
      );
    });

    const groups: Record<string, typeof filtered> = {};
    filtered.forEach(app => {
      const key = (app.candidate_email || '').toLowerCase() || (app.candidate_name || '').toLowerCase() || `unknown_${app.id}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(app);
    });

    return Object.entries(groups).map(([key, apps]) => {
      const sorted = [...apps].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      return {
        key,
        primaryApp: sorted[0],
        allSubmissions: apps
      };
    });
  }, [deduplicatedApps, applicantsSearch]);

  // 2. JOB POSTINGS DATA PREPARATION (from all teams)
  const displayJobs = useMemo(() => {
    // Requirements: candidate_name is empty or has a job code
    const reqs = deduplicatedApps.filter(app => {
      return getRemarkField(app.remarks, 'Job Code') !== 'N/A';
    });

    const groups: Record<string, typeof reqs> = {};
    reqs.forEach(app => {
      const key = `${(app.position || '').toLowerCase().trim()}|${(app.client_name || '').toLowerCase().trim()}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(app);
    });

    const groupedList = Object.keys(groups).map(key => {
      const group = groups[key];
      const rep = {
        ...(
          group.find(a => !a.candidate_name) ||
          group[0]
        )
      };
      (rep as any).associatedApps = group;

      const employeeNames = group
        .map(a => a.assigned_employee?.full_name)
        .filter(Boolean);
      (rep as any).consolidatedAnalysts = employeeNames.length > 0
        ? Array.from(new Set(employeeNames)).join(', ')
        : 'Unassigned';

      return rep;
    });

    // Filter by search term
    return groupedList.filter(app => {
      if (!jobsSearch) return true;
      const term = jobsSearch.toLowerCase();
      return (
        (app.position || '').toLowerCase().includes(term) ||
        (app.client_name || '').toLowerCase().includes(term) ||
        (app.technology || '').toLowerCase().includes(term) ||
        getRemarkField(app.remarks, 'Job Code').toLowerCase().includes(term)
      );
    });
  }, [deduplicatedApps, jobsSearch]);

  // 3. PLACEMENTS DATA PREPARATION (from all teams)
  const displayPlacements = useMemo(() => {
    const placed = deduplicatedApps.filter(app => app.status === 'Selected' || app.status === 'Offer Accepted');

    // Sort ascending for consistent Placement Code generation
    const sorted = [...placed].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

    const mapped = sorted.map((app, idx) => {
      const plcNumber = String(idx + 1).padStart(4, '0');
      return {
        ...app,
        placementCode: `PLC-${plcNumber}`
      };
    });

    // Filter by search term
    return mapped.filter(app => {
      if (!placementsSearch) return true;
      const term = placementsSearch.toLowerCase();
      return (
        (app.candidate_name || '').toLowerCase().includes(term) ||
        (app.candidate_email || '').toLowerCase().includes(term) ||
        (app.position || '').toLowerCase().includes(term) ||
        (app.client_name || '').toLowerCase().includes(term) ||
        (app.placementCode || '').toLowerCase().includes(term) ||
        getRemarkField(app.remarks, 'Job Code').toLowerCase().includes(term)
      );
    });
  }, [deduplicatedApps, placementsSearch]);




  const handleTeamMetricClick = (teamId: string, teamName: string, status: string) => {
    const teamMembers = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(teamId)));
    let teamApps = deduplicatedApps.filter(app =>
      app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
    );

    // Apply date filter if not showAllTimeKPIs
    if (!showAllTimeKPIs && startDate && endDate) {
      teamApps = teamApps.filter(app => {
        const d = (app.updated_at || app.created_at || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      });
    }

    if (status !== 'ALL') {
      if (status === 'HAS_CANDIDATE') teamApps = getUniqueCandidatesList(teamApps.filter(a => a.candidate_name));
      else if (status === 'INTERVIEWS') teamApps = teamApps.filter(a => a.status === 'Interview Scheduled' || a.status === 'Interview Completed');
      else if (status === 'Placed') teamApps = teamApps.filter(a => a.status === 'Placed');
      else if (status === 'Offer Sent') teamApps = teamApps.filter(a => a.status === 'Offer Sent' || a.status === 'On Hold');
      else if (status === 'Offer Accepted') teamApps = teamApps.filter(a => a.status === 'Offer Accepted' || a.status === 'Selected');
      else teamApps = teamApps.filter(a => a.status === status);
    } else {
      teamApps = getUniqueJobsList(teamApps);
    }

    let title = `Applications for Team ${teamName}`;
    if (status !== 'ALL' && status !== 'HAS_CANDIDATE' && status !== 'INTERVIEWS') {
      title += ` - ${status === 'Placed' ? 'Placed' : status}`;
    }
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
  const dateFilteredApps = (startDate && endDate)
    ? deduplicatedApps.filter(app => {
      const d = (app.updated_at || app.created_at || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    })
    : deduplicatedApps;

  return (
    <Box>
      {/* Header section with Greeting on Left and Calendar controls on Right */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: -0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is what's happening with the Application Tracking System today.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant={showAllTimeKPIs ? "contained" : "outlined"}
            size="small"
            onClick={() => setShowAllTimeKPIs(!showAllTimeKPIs)}
            sx={{ borderRadius: '8px', fontSize: '0.75rem', py: 0.5, fontWeight: 700 }}
          >
            {showAllTimeKPIs ? "All-Time KPIs Active" : "Show All-Time KPIs"}
          </Button>
          <DashboardCalendar
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </Box>
      </Box>

      {/* Action buttons row below greeting */}
      {!readOnly && currentUser?.role !== 'CEO' && (
        <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/teams')}
            startIcon={<ShieldCheck size={18} />}
            sx={{ borderRadius: '8px', fontWeight: 700 }}
          >
            Manage Teams
          </Button>
          <Button
            variant="contained"
            onClick={() => navigate('/users/create')}
            startIcon={<Plus size={18} />}
            sx={{ borderRadius: '8px', fontWeight: 750 }}
          >
            Onboard Employee
          </Button>
        </Box>
      )}


      {/* Pipeline KPIs – org-wide counts filtered by date or all-time */}
      <PipelineKPIs applications={showAllTimeKPIs ? deduplicatedApps : dateFilteredApps} />

      {/* Tabs Menu */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 3, mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 700,
              fontSize: '0.85rem',
              textTransform: 'none',
              minWidth: 100,
              px: 3,
            }
          }}
        >
          <Tab icon={<TrendingUp size={16} />} iconPosition="start" label="Overview & Team Activity" />
          <Tab icon={<Users size={16} />} iconPosition="start" label="Applicants" />
          <Tab icon={<Briefcase size={16} />} iconPosition="start" label="Job Postings" />
          <Tab icon={<Award size={16} />} iconPosition="start" label="Placements" />
        </Tabs>
      </Box>

      {/* Tab Panel 0: Overview & Teams */}
      {activeTab === 0 && (
        <>
          {/* CEO / Admin Hierarchy Report – full org tree */}
          {(currentUser?.role === 'CEO' || currentUser?.role === 'ADMIN' || currentUser?.role === 'REPORTING_TEAM') && (
            <HierarchyReport startDate={showAllTimeKPIs ? '' : startDate} endDate={showAllTimeKPIs ? '' : endDate} />
          )}

          {/* Senior Manager Hierarchy Report – starts from their own node */}
          {currentUser?.role === 'SENIOR_MANAGER' && (
            <HierarchyReport rootEmail={currentUser.email} startDate={showAllTimeKPIs ? '' : startDate} endDate={showAllTimeKPIs ? '' : endDate} />
          )}

          {(currentUser?.role === 'CEO' || currentUser?.role === 'ADMIN' || currentUser?.role === 'REPORTING_TEAM') && (
            <Grid container spacing={3} sx={{ mt: 1, mb: 3 }}>
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
                          <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Client Interviews</TableCell>
                          <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Client Rejections</TableCell>
                          <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Offer Sent</TableCell>
                          <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Offer Accepted</TableCell>
                          <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Placed</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(() => {
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
                            let teamApps = deduplicatedApps.filter(app =>
                              app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
                            );

                            if (!showAllTimeKPIs && startDate && endDate) {
                              teamApps = teamApps.filter(app => {
                                const d = (app.updated_at || app.created_at || '').slice(0, 10);
                                return d >= startDate && d <= endDate;
                              });
                            }

                            const assigned = getUniqueJobsList(teamApps).length;
                            const subs = getUniqueCandidatesList(teamApps.filter(app => app.candidate_name)).length;
                            const pending = teamApps.filter(app => app.status === 'Under Review').length;
                            const placed = teamApps.filter(app => app.status === 'Placed').length;
                            const ints = teamApps.filter(app => ['Interview Scheduled', 'Interview Completed'].includes(app.status)).length;
                            const rejections = teamApps.filter(app => app.status === 'Rejected').length;
                            const offerSent = teamApps.filter(app => app.status === 'Offer Sent' || app.status === 'On Hold').length;
                            const offerAccepted = teamApps.filter(app => app.status === 'Offer Accepted' || app.status === 'Selected').length;

                            return (
                              <TableRow key={team.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                <TableCell sx={{ fontWeight: 650 }}>{team.name}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(assigned, team.id, team.name, 'ALL')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(subs, team.id, team.name, 'HAS_CANDIDATE')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(pending, team.id, team.name, 'Under Review')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(ints, team.id, team.name, 'INTERVIEWS')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(rejections, team.id, team.name, 'Rejected')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(offerSent, team.id, team.name, 'Offer Sent')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(offerAccepted, team.id, team.name, 'Offer Accepted')}</TableCell>
                                <TableCell sx={{ textAlign: 'center' }}>{renderTeamMetric(placed, team.id, team.name, 'Placed')}</TableCell>
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

          {/* Recent Employee Onboardings */}
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '12px', boxShadow: 'none' }}>
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
        </>
      )}

      {/* Tab Panel 1: Applicants Registry */}
      {activeTab === 1 && (
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, boxShadow: 'none' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                All Applicants
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Viewing candidates and applications across all teams
              </Typography>
            </Box>
            <TextField
              placeholder="Search by name, email, position, client, job code..."
              value={applicantsSearch}
              onChange={(e) => setApplicantsSearch(e.target.value)}
              size="small"
              sx={{ width: 320 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: applicantsSearch && (
                  <IconButton size="small" onClick={() => setApplicantsSearch('')}>
                    <X size={16} />
                  </IconButton>
                )
              }}
            />
          </Box>

          <TableContainer>
            <Table size="small" sx={{ '& .MuiTableCell-root': { padding: '4px 8px', fontSize: '0.72rem' } }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#edf5fd' : '#1e293b' }}>
                  <TableCell style={{ width: '50px' }}></TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Candidate Name</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Recent Position & Client</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Technology</TableCell>
                  <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Total Applications</TableCell>
                  {!readOnly && <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayApplicants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 6 : 7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No applicants found matching the filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayApplicants.map(({ key, primaryApp, allSubmissions }) => {
                    const isExpanded = !!expandedCandidates[key];
                    return (
                      <React.Fragment key={key}>
                        <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Box
                              onClick={() => setExpandedCandidates(prev => ({ ...prev, [key]: !prev[key] }))}
                              sx={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 0.5, userSelect: 'none' }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 900, color: 'primary.main', fontSize: '0.9rem', lineHeight: 1 }}>
                                {isExpanded ? '−' : '+'}
                              </Typography>
                              <Box sx={{ bgcolor: 'primary.main', color: '#fff', fontSize: '0.6rem', fontWeight: 700, px: 0.5, py: 0.1, borderRadius: '3px' }}>
                                {allSubmissions.length}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={() => navigate(`/candidates/${primaryApp.id}/details`)}>
                            {primaryApp.candidate_name}
                          </TableCell>
                          <TableCell>{primaryApp.candidate_email || '—'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.72rem', fontWeight: 650 }}>{primaryApp.position}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.65rem' }}>
                              <Building size={11} /> {primaryApp.client_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={primaryApp.technology || 'N/A'} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center', fontWeight: 700 }}>{allSubmissions.length}</TableCell>
                          {!readOnly && (
                            <TableCell sx={{ textAlign: 'center' }}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteJobGroup(allSubmissions, primaryApp.candidate_name)}
                                sx={{ p: 0.25 }}
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            </TableCell>
                          )}
                        </TableRow>

                        {isExpanded && (
                          <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                            <TableCell colSpan={readOnly ? 6 : 7} style={{ padding: '8px 12px' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, color: 'text.secondary', fontSize: '0.68rem' }}>
                                SUBMISSIONS HISTORY
                              </Typography>
                              <TableContainer sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '6px' }}>
                                <Table size="small" sx={{ backgroundColor: theme.palette.background.paper, '& .MuiTableCell-root': { padding: '3px 6px', fontSize: '0.68rem' } }}>
                                  <TableHead>
                                    <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                                      <TableCell sx={{ fontWeight: 700 }}>Job Code</TableCell>
                                      <TableCell sx={{ fontWeight: 700 }}>Position & Client</TableCell>
                                      <TableCell sx={{ fontWeight: 700 }}>Assigned Analyst</TableCell>
                                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                                      {!readOnly && <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Actions</TableCell>}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {allSubmissions.map((sub) => (
                                      <TableRow key={sub.id}>
                                        <TableCell>
                                          {getRemarkField(sub.remarks, 'Job Code') !== 'N/A' ? getRemarkField(sub.remarks, 'Job Code') : '—'}
                                        </TableCell>
                                        <TableCell>
                                          <Typography variant="body2" sx={{ fontSize: '0.68rem', fontWeight: 650 }}>{sub.position}</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>{sub.client_name}</Typography>
                                        </TableCell>
                                        <TableCell>
                                          {sub.assigned_employee?.full_name || sub.recruiter || 'System'}
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                                          {sub.status}
                                        </TableCell>
                                        <TableCell>
                                          {new Date(sub.updated_at || sub.created_at || '').toLocaleDateString()}
                                        </TableCell>
                                        {!readOnly && (
                                          <TableCell sx={{ textAlign: 'center' }}>
                                            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                                              <Typography
                                                variant="body2"
                                                sx={{ fontSize: '0.68rem', fontWeight: 750, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                                onClick={() => navigate(`/candidates/create/${sub.id}`)}
                                              >
                                                Edit
                                              </Typography>
                                              <Typography
                                                variant="body2"
                                                sx={{ fontSize: '0.68rem', fontWeight: 750, color: 'error.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                                onClick={() => handleDeleteSubmission(String(sub.id), sub.candidate_name)}
                                              >
                                                Delete
                                              </Typography>
                                            </Box>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Tab Panel 2: Job Postings */}
      {activeTab === 2 && (
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, boxShadow: 'none' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                All Job Requirements
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Viewing active and closed requirements across all teams
              </Typography>
            </Box>
            <TextField
              placeholder="Search by position, client, job code..."
              value={jobsSearch}
              onChange={(e) => setJobsSearch(e.target.value)}
              size="small"
              sx={{ width: 320 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: jobsSearch && (
                  <IconButton size="small" onClick={() => setJobsSearch('')}>
                    <X size={16} />
                  </IconButton>
                )
              }}
            />
          </Box>

          <TableContainer>
            <Table size="small" sx={{ '& .MuiTableCell-root': { padding: '4px 8px', fontSize: '0.72rem' } }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#edf5fd' : '#1e293b' }}>
                  <TableCell style={{ width: '50px' }}></TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Job Code</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Position & Client</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Assignees</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Bill Rate / Salary</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Pay Rate</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                  {!readOnly && <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 8 : 9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No jobs found matching the filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayJobs.map((app) => {
                    const jobCodeVal = getRemarkField(app.remarks, 'Job Code');
                    const jobCodeKey = `${app.position?.toLowerCase().trim()}|${app.client_name?.toLowerCase().trim()}`;
                    const isExpanded = !!expandedGroupedJobs[jobCodeKey];

                    // Find all applicant submissions matching this group
                    const jobApplicants = applications.filter(a =>
                      a.candidate_name &&
                      a.position?.toLowerCase().trim() === app.position?.toLowerCase().trim() &&
                      a.client_name?.toLowerCase().trim() === app.client_name?.toLowerCase().trim()
                    );

                    return (
                      <React.Fragment key={app.id}>
                        <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Box
                              onClick={() => setExpandedGroupedJobs(prev => ({ ...prev, [jobCodeKey]: !prev[jobCodeKey] }))}
                              sx={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 0.5, userSelect: 'none' }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 900, color: 'primary.main', fontSize: '0.9rem', lineHeight: 1 }}>
                                {isExpanded ? '−' : '+'}
                              </Typography>
                              <Box sx={{ bgcolor: 'primary.main', color: '#fff', fontSize: '0.6rem', fontWeight: 700, px: 0.5, py: 0.1, borderRadius: '3px' }}>
                                {jobApplicants.length}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {jobCodeVal !== 'N/A' ? jobCodeVal : '—'}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.72rem', fontWeight: 650 }}>{app.position}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{app.client_name}</Typography>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const loc = getRemarkField(app.remarks, 'Location');
                              if (loc !== 'N/A') return loc;
                              const cityState = [app.city, app.state].filter(Boolean).join(', ');
                              return cityState || '—';
                            })()}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>
                            {(app as any).consolidatedAnalysts}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const billRate = getRemarkField(app.remarks, 'Client Bill Rate');
                              if (billRate !== 'N/A') return billRate;
                              const salary = getRemarkField(app.remarks, 'Salary');
                              return salary !== 'N/A' ? salary : '—';
                            })()}
                          </TableCell>
                          <TableCell>
                            {getRemarkField(app.remarks, 'Pay Rate') !== 'N/A' ? getRemarkField(app.remarks, 'Pay Rate') : '—'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={getRemarkField(app.remarks, 'Job Status') !== 'N/A' ? getRemarkField(app.remarks, 'Job Status') : 'Active'}
                              color={getRemarkField(app.remarks, 'Job Status') === 'Active' ? 'success' : 'default'}
                              size="small"
                              sx={{ fontSize: '0.6rem', height: 18 }}
                            />
                          </TableCell>
                          {!readOnly && (
                            <TableCell sx={{ textAlign: 'center' }}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteJobGroup(jobApplicants.length > 0 ? [...(app as any).associatedApps, ...jobApplicants] : (app as any).associatedApps, app.position)}
                                sx={{ p: 0.25 }}
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            </TableCell>
                          )}
                        </TableRow>

                        {isExpanded && (
                          <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                            <TableCell colSpan={readOnly ? 8 : 9} style={{ padding: '8px 12px' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, color: 'text.secondary', fontSize: '0.68rem' }}>
                                ASSOCIATED APPLICANTS ({jobApplicants.length})
                              </Typography>
                              {jobApplicants.length === 0 ? (
                                <Typography variant="body2" sx={{ fontSize: '0.68rem', color: 'text.secondary', py: 0.5 }}>
                                  No applicants sourced for this requirement.
                                </Typography>
                              ) : (
                                <TableContainer sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '6px' }}>
                                  <Table size="small" sx={{ backgroundColor: theme.palette.background.paper, '& .MuiTableCell-root': { padding: '3px 6px', fontSize: '0.68rem' } }}>
                                    <TableHead>
                                      <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>Applicant Name</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Sourced By</TableCell>
                                        {!readOnly && <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Actions</TableCell>}
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {jobApplicants.map((applicant) => (
                                        <TableRow key={applicant.id}>
                                          <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            {applicant.candidate_name}
                                          </TableCell>
                                          <TableCell>{applicant.candidate_email || '—'}</TableCell>
                                          <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            {applicant.status}
                                          </TableCell>
                                          <TableCell>{applicant.recruiter || applicant.assigned_employee?.full_name || 'System'}</TableCell>
                                          {!readOnly && (
                                            <TableCell sx={{ textAlign: 'center' }}>
                                              <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                                                <Typography
                                                  variant="body2"
                                                  sx={{ fontSize: '0.68rem', fontWeight: 750, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                                  onClick={() => navigate(`/candidates/create/${applicant.id}`)}
                                                >
                                                  Edit
                                                </Typography>
                                                <Typography
                                                  variant="body2"
                                                  sx={{ fontSize: '0.68rem', fontWeight: 750, color: 'error.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                                  onClick={() => handleDeleteSubmission(String(applicant.id), applicant.candidate_name)}
                                                >
                                                  Delete
                                                </Typography>
                                              </Box>
                                            </TableCell>
                                          )}
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
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Tab Panel 3: Placements */}
      {activeTab === 3 && (
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, boxShadow: 'none' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                All Placements
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Viewing placement registry and margins across all teams
              </Typography>
            </Box>
            <TextField
              placeholder="Search by placement code, candidate, client, job code..."
              value={placementsSearch}
              onChange={(e) => setPlacementsSearch(e.target.value)}
              size="small"
              sx={{ width: 320 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: placementsSearch && (
                  <IconButton size="small" onClick={() => setPlacementsSearch('')}>
                    <X size={16} />
                  </IconButton>
                )
              }}
            />
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#edf5fd' : '#1e293b' }}>
                  <TableCell sx={{ fontWeight: 800 }}>Placement Code</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Candidate Name</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Client & Position</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Client Bill Rate</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Pay Rate</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Margin/Spread</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Start Date</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Assigned Analyst</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayPlacements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No placements found matching the filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayPlacements.map((app) => (
                    <TableRow key={app.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {app.placementCode}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {app.candidate_name}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 650 }}>{app.position}</Typography>
                        <Typography variant="caption" color="text.secondary">{app.client_name}</Typography>
                      </TableCell>
                      <TableCell>
                        {getRemarkField(app.remarks, 'Client Bill Rate')}
                      </TableCell>
                      <TableCell>
                        {getRemarkField(app.remarks, 'Pay Rate')}
                      </TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 700 }}>
                        {getProfitAmount(app.remarks || '')}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const actStart = getRemarkField(app.remarks, 'Actual Start Date');
                          return actStart !== 'N/A' ? actStart : getRemarkField(app.remarks, 'Start Date');
                        })()}
                      </TableCell>
                      <TableCell>
                        {app.assigned_employee?.full_name || app.recruiter || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Dialog for Clickable Metrics */}
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


    </Box>

  );
};
