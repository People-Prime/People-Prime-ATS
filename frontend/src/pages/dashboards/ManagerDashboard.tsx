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
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Button
} from '@mui/material';
import { X, Building } from 'lucide-react';
import { useAppSelector } from '../../redux/store';
import { PipelineKPIs, getUniqueSubmissions } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

export const ManagerDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogData, setDialogData] = useState<any[]>([]);
  const [dialogTitle, setDialogTitle] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

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

  // 3. Find all users belonging to these teams or reporting directly to this manager
  const teamMembers = users.filter(u => 
    (u.teams && u.teams.some(t => myTeams.some(mt => String(mt.id) === String(t.id)))) ||
    (u.reporting_to_list && u.reporting_to_list.some((r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase()))
  );

  const deduplicatedApps = getUniqueSubmissions(applications);

  // 4. Find all applications assigned to these team members
  const myTeamApps = deduplicatedApps.filter(app => 
    app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
  );

  // Apply date range filtering
  const dateFilteredApps = (startDate && endDate)
    ? myTeamApps.filter(app => {
        const d = (app.updated_at || app.created_at || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      })
    : myTeamApps;

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
      const key = (jobCode !== 'N/A' && jobCode)
        ? jobCode.toUpperCase().trim()
        : `${(app.position || '').toLowerCase().trim()}|${(app.client_name || '').toLowerCase().trim()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueJobs.push(app);
      }
    });
    return uniqueJobs;
  };

  const handleTeamMetricClick = (teamId: string, teamName: string, status: string) => {
    const members = users.filter(u => u.teams && u.teams.some(t => String(t.id) === String(teamId)));
    let teamApps = deduplicatedApps.filter(app => 
      app.assigned_employee && members.some(member => member.email === app.assigned_employee?.email)
    );

    if (!showAllTimeKPIs && startDate && endDate) {
      teamApps = teamApps.filter(app => {
        const d = (app.updated_at || app.created_at || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      });
    }

    if (status !== 'ALL') {
       if (status === 'HAS_CANDIDATE') teamApps = teamApps.filter(a => a.candidate_name);
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

      {/* Pipeline KPIs */}
      <PipelineKPIs applications={showAllTimeKPIs ? myTeamApps : dateFilteredApps} />

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
                      const subs = teamApps.filter(app => app.candidate_name).length;
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

      {/* Clickable metric dialog */}
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
                    const isRequirement = !app.candidate_name;
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
