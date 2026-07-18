import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Grid, 
  Typography, 
  Card,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button
} from '@mui/material';
import { useAppSelector } from '../../redux/store';
import { getUniqueSubmissions } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

export const ManagerDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  const [startDate, setStartDate] = useState(() => localStorage.getItem('dashboard_start_date') || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem('dashboard_end_date') || todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('dashboard_start_date', startDate);
    localStorage.setItem('dashboard_end_date', endDate);
  }, [startDate, endDate]);
  // Local dialog states removed because we navigate to dedicated DrillDownPage


  // 1. Identify team leads who report to this Senior Manager
  const myLeads = users.filter(u => 
    (u.role === 'TEAM_LEAD' || u.role === 'SUB_LEAD') && 
    u.reporting_to_list && u.reporting_to_list.some((r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase())
  );

  // 2. Identify the unique teams led by these leads
  const myTeams: any[] = [];
  myLeads.forEach(lead => {
    if (lead.teams && lead.teams.length > 0) {
      lead.teams.forEach(t => {
        if (!myTeams.some(item => String(item.id) === String(t.id))) {
          myTeams.push(t);
        }
      });
    }
  });


  // 1. Filter raw applications by date range first
  const dateFilteredRawApps = React.useMemo(() => {
    if (!startDate || !endDate) return applications;
    return applications.filter((app: any) => {
      const d = (app.updated_at || app.created_at || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [applications, startDate, endDate]);

  // 2. Deduplicate the date-filtered applications
  const deduplicatedAppsForCount = React.useMemo(() => {
    return getUniqueSubmissions(dateFilteredRawApps);
  }, [dateFilteredRawApps]);



  const getRemarkField = (remarks: string | undefined, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
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

  const handleTeamMetricClick = (teamId: string, teamName: string, status: string) => {
    const members = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(teamId)));
    let teamApps = deduplicatedAppsForCount.filter((app: any) => 
      app.assigned_employee && members.some((member: any) => member.email === app.assigned_employee?.email)
    );

    if (startDate && endDate) {
      teamApps = teamApps.filter((app: any) => {
        const d = (app.created_at || '').slice(0, 10);
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
    
    navigate('/drill-down', {
      state: {
        modalTitle: title,
        modalData: teamApps,
        isJobsType: status === 'ALL',
        isHierarchyType: status !== 'ALL'
      }
    });
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

  return (
    <Box>
      {/* Title block */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: -0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is the status of the teams reporting to you.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => setShowAllTimeKPIs(!showAllTimeKPIs)}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, py: 0.8 }}
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


      {/* Hierarchy Report – starts from this Senior Manager's own node */}
      {currentUser && <HierarchyReport rootEmail={currentUser.email} startDate={showAllTimeKPIs ? '' : startDate} endDate={showAllTimeKPIs ? '' : endDate} />}

      {/* Teams recruitment table */}
      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <Card sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '12px', boxShadow: 'none' }}>
            <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="h6" fontWeight={750} sx={{ fontSize: '0.95rem' }}>
                Recruitment Activity - Under Your Management
              </Typography>
            </Box>
            <TableContainer sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px' }}>
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
                  {myTeams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        No reporting teams found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    myTeams.map((team: any) => {
                      const members = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(team.id)));
                      let teamApps = applications.filter(app => 
                        app.assigned_employee && members.some(member => member.email === app.assigned_employee?.email)
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
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

    </Box>
  );
};
