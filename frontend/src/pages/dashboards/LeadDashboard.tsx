import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Card,
  Avatar,
  Button,
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
  FormControl,
  Select,
  MenuItem,
  TextField,
  DialogActions,
  Chip
} from '@mui/material';
import { Plus, X, Building, Check, RefreshCw } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../../redux/store';
import { changeApplicationStatus, addApplicationNote } from '../../redux/applicationsSlice';
import { api } from '../../services/api';
import { ApplicationStatus } from '../../types';
import { PipelineKPIs, getUniqueSubmissions } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';

const COLORS = ['#4f46e5', '#0d9488', '#f59e0b', '#ef4444', '#10b981', '#06b6d4', '#8b5cf6'];

export const LeadDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  const dbCurrentUser = users.find(u => u.email === currentUser?.email);
  // Get all teams the lead is associated with (via M2M)
  const myTeamIds = (dbCurrentUser?.teams || currentUser?.teams || []).map((t: any) => String(t.id));
  const myTeamName = (dbCurrentUser?.teams || currentUser?.teams || [])[0]?.name || 'My Team';
  const teamMembers = users.filter(u => {
    // Member belongs to one of this lead's teams
    const inTeam = u.teams && u.teams.some(t => myTeamIds.includes(String(t.id)));
    // OR member directly reports to this lead (reporting_to_list is the full array)
    const reportsToMe = u.reporting_to_list && u.reporting_to_list.some(
      (r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase()
    );
    return inTeam || reportsToMe;
  });



  // Applications assigned to team members (deduplicated)
  const teamApplications = getUniqueSubmissions(applications).filter(app =>
    app.assigned_employee && teamMembers.some(member => member.email === app.assigned_employee?.email)
  );

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);
  const dispatch = useAppDispatch();
  const [statusUpdateApp, setStatusUpdateApp] = useState<any | null>(null);
  const [statusUpdateValue, setStatusUpdateValue] = useState<ApplicationStatus>('New');
  const [statusUpdateComment, setStatusUpdateComment] = useState('');

  const handleUpdateStatusSubmit = async () => {
    if (!statusUpdateApp) return;
    try {
      await api.patch(`applications/${statusUpdateApp.id}/`, { status: statusUpdateValue });

      const commentMsg = statusUpdateComment ? `\nComment: ${statusUpdateComment}` : '';
      await api.post(`applications/${statusUpdateApp.id}/add-note/`, {
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`
      });

      dispatch(changeApplicationStatus({ id: statusUpdateApp.id, status: statusUpdateValue }));

      dispatch(addApplicationNote({
        id: `note_status_${Date.now()}`,
        application_id: statusUpdateApp.id,
        author: {
          id: currentUser?.id || 'sys',
          full_name: currentUser?.full_name || 'System',
          role: currentUser?.role || 'TEAM_LEAD'
        },
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`,
        created_at: new Date().toISOString()
      }));

      setStatusUpdateApp(null);
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  // Filter team applications by selected date (KPIs + table)
  const dateFilteredTeamApps = selectedDate
    ? teamApplications.filter(app => {
      const d = app.updated_at || app.created_at || '';
      return d.slice(0, 10) === selectedDate;
    })
    : teamApplications;

  const handleOpenAddReq = () => {

    navigate('/applications/create');
  };

  const [openDialog, setOpenDialog] = useState(false);
  const [dialogData, setDialogData] = useState<any[]>([]);
  const [dialogTitle, setDialogTitle] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  const getRemarkField = (remarks: string | undefined, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
  };

  const handleMetricClick = (searchName: string, status: string) => {
    let filtered = dateFilteredTeamApps;
    if (searchName) {
       filtered = filtered.filter(a => {
         const member = users.find(u => u.full_name === searchName || u.email === searchName);
         if (!member) return a.assigned_employee?.full_name === searchName;
         
         const isAssigned = String(a.assigned_employee?.id) === String(member.id) || 
                           (a.assigned_employee?.email && member.email && a.assigned_employee.email.toLowerCase() === member.email.toLowerCase());
         
         const isRecruiter = a.recruiter && (
           (member.full_name && a.recruiter.toLowerCase() === member.full_name.toLowerCase()) ||
           (member.email && a.recruiter.toLowerCase() === member.email.toLowerCase())
         );
         
         if (status === 'ALL') {
           return isAssigned;
         }
         return isRecruiter || (!a.recruiter && isAssigned);
       });
    }
    if (status !== 'ALL') {
       if (status === 'HAS_CANDIDATE') filtered = filtered.filter(a => a.candidate_name);
       else if (status === 'INTERVIEWS') filtered = filtered.filter(a => a.status === 'Interview Scheduled' || a.status === 'Interview Completed');
       else filtered = filtered.filter(a => a.status === status);
    }
    
    let title = searchName ? `Applications for ${searchName}` : 'Team Applications';
    if (status !== 'ALL' && status !== 'HAS_CANDIDATE' && status !== 'INTERVIEWS') title += ` - ${status}`;
    else if (status === 'HAS_CANDIDATE') title += ' - Submissions';
    else if (status === 'INTERVIEWS') title += ' - Client Interviews';
    else title += ' - Assigned Jobs';
    
    setDialogTitle(title);
    setDialogData(filtered);
    setOpenDialog(true);
  };

  const renderClickableMetric = (value: number, searchName: string, status: string) => {
    if (value === 0) return <Typography variant="body2" fontWeight={700} color="text.secondary">0</Typography>;
    return (
      <Typography
        variant="body2"
        fontWeight={700}
        color="primary.main"
        sx={{ cursor: 'pointer', textDecoration: 'none', '&:hover': { color: 'primary.dark', textDecoration: 'underline' } }}
        onClick={() => handleMetricClick(searchName, status)}
      >
        {value}
      </Typography>
    );
  };


  return (
    <Box>
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between', 
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: 2,
          mb: 3.5 
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Team Management: <span style={{ color: theme.palette.primary.main }}>{myTeamName}</span>
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
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
            totalCount={dateFilteredTeamApps.length}
            allCount={teamApplications.length}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={handleOpenAddReq}
            sx={{ borderRadius: '8px', fontSize: '0.8rem', py: 0.5 }}
          >
            Add Job Opening
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={() => navigate('/candidates/create')}
            sx={{ borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', py: 0.5 }}
          >
            Add Candidate
          </Button>
        </Box>
      </Box>

      <PipelineKPIs applications={showAllTimeKPIs ? teamApplications : dateFilteredTeamApps} />

      {/* Recruitment Activity - By Team */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight={750}>
                Recruitment Activity - By Team
              </Typography>
            </Box>
            <TableContainer>
              <Table 
                sx={{ 
                  minWidth: 650,
                  '& .MuiTableCell-root': {
                    padding: '4px 8px',
                    fontSize: '0.75rem'
                  },
                  '& .MuiTableCell-head': {
                    padding: '6px 8px',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap'
                  },
                  '& .MuiTypography-root': {
                    fontSize: '0.75rem'
                  }
                }} 
                size="small"
              >
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Team Member</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Assigned Jobs</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Submissions</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Pending Feedback</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Client Submissions</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Client Interviews</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Client Rejections</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Offer Sent</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Offer Accepted</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Placed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    let totalAssigned = 0;
                    let totalSubmissions = 0;
                    let totalPendingFeedback = 0;
                    let totalClientSubs = 0;
                    let totalClientInterviews = 0;
                    let totalClientRejections = 0;
                    let totalOffers = 0;
                    let totalOfferAccepted = 0;
                    let totalPlaced = 0;

                    const memberStats = teamMembers.map(member => {
                      // Filter items associated with this member
                      const assignedApps = dateFilteredTeamApps.filter(a => 
                        String(a.assigned_employee?.id) === String(member.id) || 
                        (a.assigned_employee?.email && member.email && a.assigned_employee.email.toLowerCase() === member.email.toLowerCase())
                      );

                      const sourcedApps = dateFilteredTeamApps.filter(a => {
                        const isRecruiter = a.recruiter && (
                          (member.full_name && a.recruiter.toLowerCase() === member.full_name.toLowerCase()) ||
                          (member.email && a.recruiter.toLowerCase() === member.email.toLowerCase())
                        );
                        const isAssigned = String(a.assigned_employee?.id) === String(member.id) || 
                                          (a.assigned_employee?.email && member.email && a.assigned_employee.email.toLowerCase() === member.email.toLowerCase());
                        
                        return a.candidate_name && (isRecruiter || (!a.recruiter && isAssigned));
                      });
                      
                      const assigned = assignedApps.length;
                      const subs = sourcedApps.length;
                      const pending = sourcedApps.filter(a => a.status === 'Under Review').length;
                      const clientSubs = sourcedApps.filter(a => a.status === 'Submitted').length;
                      const ints = sourcedApps.filter(a => a.status === 'Interview Scheduled' || a.status === 'Interview Completed').length;
                      const rejections = sourcedApps.filter(a => a.status === 'Rejected').length;
                      const offers = sourcedApps.filter(a => a.status === 'On Hold').length;
                      const offerAcc = sourcedApps.filter(a => a.status === 'Selected').length;
                      const placed = sourcedApps.filter(a => a.status === 'Selected').length;

                      totalAssigned += assigned;
                      totalSubmissions += subs;
                      totalPendingFeedback += pending;
                      totalClientSubs += clientSubs;
                      totalClientInterviews += ints;
                      totalClientRejections += rejections;
                      totalOffers += offers;
                      totalOfferAccepted += offerAcc;
                      totalPlaced += placed;

                      return { member, assigned, subs, pending, clientSubs, ints, rejections, offers, offerAcc, placed };
                    });

                    return (
                      <>
                        <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                          <TableCell sx={{ fontWeight: 700 }}>
                            <Typography variant="body2" fontWeight={700} color="primary.main">{(currentUser?.full_name || 'Team Lead').toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</Typography>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalAssigned, '', 'ALL')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalSubmissions, '', 'HAS_CANDIDATE')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalPendingFeedback, '', 'Under Review')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalClientSubs, '', 'Submitted')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalClientInterviews, '', 'INTERVIEWS')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalClientRejections, '', 'Rejected')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalOffers, '', 'On Hold')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalOfferAccepted, '', 'Selected')}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, verticalAlign: 'top', borderRight: `1px solid ${theme.palette.divider}` }}>
                            {renderClickableMetric(totalPlaced, '', 'Selected')}
                          </TableCell>
                        </TableRow>
                        {memberStats.map((stat, idx) => (
                          <TableRow key={stat.member.id}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: COLORS[idx % COLORS.length] }}>
                                  {stat.member.full_name.charAt(0)}
                                </Avatar>
                                <Typography variant="body2" fontWeight={500}>{stat.member.full_name}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>{renderClickableMetric(stat.assigned, stat.member.full_name, 'ALL')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.subs, stat.member.full_name, 'HAS_CANDIDATE')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.pending, stat.member.full_name, 'Under Review')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.clientSubs, stat.member.full_name, 'Submitted')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.ints, stat.member.full_name, 'INTERVIEWS')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.rejections, stat.member.full_name, 'Rejected')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.offers, stat.member.full_name, 'On Hold')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.offerAcc, stat.member.full_name, 'Selected')}</TableCell>
                            <TableCell>{renderClickableMetric(stat.placed, stat.member.full_name, 'Selected')}</TableCell>
                          </TableRow>
                        ))}
                        {memberStats.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={10} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                              No Associate Analysts in this team.
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>{dialogTitle}</Typography>
          <IconButton onClick={() => setOpenDialog(false)} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
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

                    // Primary: job code. Fallback: position + client (handles pre-fix records)
                    const key = jobCode !== 'N/A' && jobCode
                      ? `${jobCode}|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}`
                      : `pos|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}`;
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
                    const jobCodeKey = jobCodeVal !== 'N/A' && jobCodeVal
                      ? `${jobCodeVal}|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}`
                      : `pos|${app.position?.toLowerCase()}|${app.client_name?.toLowerCase()}`;
                    const jobApplicants = dialogData.filter(a => 
                      a.candidate_name && 
                      (jobCodeVal !== 'N/A' && jobCodeVal
                        // Match by job code (preferred) OR by position+client for legacy records
                        ? (getRemarkField(a.remarks, 'Job Code') === jobCodeVal || getRemarkField(a.remarks, 'Job Code') === 'N/A')
                          && a.position?.toLowerCase() === app.position?.toLowerCase()
                          && a.client_name?.toLowerCase() === app.client_name?.toLowerCase()
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
                                          <TableCell 
                                            sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setStatusUpdateApp(applicant);
                                              setStatusUpdateValue(applicant.status as ApplicationStatus);
                                              setStatusUpdateComment('');
                                            }}
                                          >
                                            {applicant.status}
                                          </TableCell>
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

      {/* UPDATE STATUS DIALOG */}
      <Dialog
        open={statusUpdateApp !== null}
        onClose={() => setStatusUpdateApp(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: '16px', p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: `1px solid ${theme.palette.divider}`, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RefreshCw size={20} style={{ color: theme.palette.text.primary }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Update Status</Typography>
          </Box>
          <Chip
            label={statusUpdateApp?.status || 'Unknown'}
            color="primary"
            variant="outlined"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent>
          {statusUpdateApp && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {statusUpdateApp.candidate_name || 'No Candidate Assigned'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {statusUpdateApp.position} @ {statusUpdateApp.client_name}
              </Typography>

              <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                STATUS
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 3 }}>
                <Select
                  value={statusUpdateValue}
                  onChange={(e) => setStatusUpdateValue(e.target.value as ApplicationStatus)}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value="New">New</MenuItem>
                  <MenuItem value="Submitted">Submitted</MenuItem>
                  <MenuItem value="Under Review">Under Review</MenuItem>
                  <MenuItem value="Interview Scheduled">Interview Scheduled</MenuItem>
                  <MenuItem value="Interview Completed">Interview Completed</MenuItem>
                  <MenuItem value="Selected">Selected</MenuItem>
                  <MenuItem value="Rejected">Rejected</MenuItem>
                  <MenuItem value="On Hold">On Hold</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                COMMENTS
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder="Optional comments..."
                value={statusUpdateComment}
                onChange={(e) => setStatusUpdateComment(e.target.value)}
                InputProps={{ sx: { borderRadius: '8px' } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'flex-start' }}>
          <Button
            onClick={handleUpdateStatusSubmit}
            color="primary"
            variant="contained"
            startIcon={<Check size={16} />}
            sx={{ borderRadius: '8px', fontWeight: 700, px: 3 }}
          >
            Update
          </Button>
          <Button
            onClick={() => setStatusUpdateApp(null)}
            variant="outlined"
            sx={{ borderRadius: '8px', fontWeight: 600, px: 3, color: 'text.secondary', borderColor: 'divider' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
