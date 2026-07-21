import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Chip, 
  IconButton, 
  Drawer, 
  Divider, 
  Paper, 
  Avatar,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import { 
  Search, 
  Download, 
  X, 
  BookOpen, 
  Check, 
  MessageSquare,
  Building,
  RefreshCw
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { changeApplicationStatus, addApplicationNote, updateApplication, setApplications, deleteApplication } from '../redux/applicationsSlice';
import { Application, ApplicationStatus } from '../types';
import { api } from '../services/api';

const getRemarkField = (remarks: string | undefined | null, fieldName: string): string => {
  if (!remarks) return 'N/A';
  // Use [ \t]* instead of \s* to prevent matching across newlines when value is missing
  const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'm'));
  const value = match ? match[1].trim() : 'N/A';
  const cleanVal = value && value !== '' ? value : 'N/A';
  if (fieldName === 'Job Code' && cleanVal !== 'N/A') {
    if (!cleanVal.toUpperCase().startsWith('PPW')) {
      return 'N/A';
    }
  }
  return cleanVal;
};

export const JobPostings: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications, notes } = useAppSelector(state => state.applications);
  const { users } = useAppSelector(state => state.users);

  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTeamId, setSelectedTeamId] = useState('ALL');

  const todayStr = (): string => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const teamsList = React.useMemo(() => {
    const unique = new Map();
    users.flatMap(u => u.teams || []).filter(t => t && t.id).forEach(t => {
      unique.set(String(t.id), t);
    });
    return Array.from(unique.values());
  }, [users]);

  // Drawer detail states
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [newNoteText, setNewNoteText] = useState('');

  // Deletion confirmation state
  const [deleteAppConfirm, setDeleteAppConfirm] = useState<Application | null>(null);

  // Job Status change modal state
  const [jobStatusUpdateApp, setJobStatusUpdateApp] = useState<any | null>(null);
  const [jobStatusUpdateValue, setJobStatusUpdateValue] = useState<string>('Active');
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  // Candidate status update modal states
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
          role: activeRole
        },
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`,
        created_at: new Date().toISOString()
      }));

      setStatusUpdateApp(null);
    } catch (err) {
      alert("Failed to update status.");
    }
  };



  const handleConfirmDelete = async () => {
    if (!deleteAppConfirm) return;
    try {
      const idsToDelete = (deleteAppConfirm as any).associatedIds || [String(deleteAppConfirm.id)];
      for (const id of idsToDelete) {
        await api.delete(`applications/${id}/`);
        dispatch(deleteApplication(String(id)));
      }
      setDeleteAppConfirm(null);
    } catch (err) {
      alert("Failed to delete application requirement.");
    }
  };



  // Editing state and form
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    candidateName: '',
    candidateEmail: '',
    candidatePhone: '',
    technology: '',
    experience: '',
    description: ''
  });

  const extractDescription = (remarks: string) => {
    const match = (remarks || '').match(/Description:\s*(.*)/);
    return match ? match[1].trim() : '';
  };

  const updateRemarksDescription = (oldRemarks: string, newDesc: string) => {
    if (!oldRemarks) return `Description: ${newDesc}`;
    const regex = /Description:\s*(.*)/;
    if (regex.test(oldRemarks)) {
      return oldRemarks.replace(regex, `Description: ${newDesc}`);
    } else {
      return oldRemarks + `\nDescription: ${newDesc}`;
    }
  };

  const handleStartEdit = () => {
    if (!selectedApp) return;
    setEditForm({
      candidateName: selectedApp.candidate_name || '',
      candidateEmail: selectedApp.candidate_email || '',
      candidatePhone: selectedApp.candidate_phone || '',
      technology: selectedApp.technology || '',
      experience: String(selectedApp.experience) || '',
      description: extractDescription(selectedApp.remarks || '')
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedApp) return;
    
    try {
      const idsToUpdate = (selectedApp as any).associatedIds || [String(selectedApp.id)];
      let lastUpdatedApp = null;
      for (const id of idsToUpdate) {
        const targetApp = (selectedApp as any).associatedApps?.find((a: any) => String(a.id) === String(id)) || selectedApp;
        const payload = {
          ...targetApp,
          candidate_name: editForm.candidateName,
          candidate_email: editForm.candidateEmail,
          candidate_phone: editForm.candidatePhone,
          technology: editForm.technology,
          experience: parseFloat(editForm.experience) || targetApp.experience,
          remarks: updateRemarksDescription(targetApp.remarks || '', editForm.description)
        };
        const res = await api.put(`applications/${id}/`, payload);
        dispatch(updateApplication(res.data));
        if (String(id) === String(selectedApp.id)) {
          lastUpdatedApp = res.data;
        }
      }
      
      setSelectedApp(lastUpdatedApp || selectedApp);
      setIsEditing(false);
    } catch (err) {
      alert("Failed to update candidate and job details.");
    }
  };
  
  // Sourcing form state (for analyst updating a New requirement - Ciepal fields)
  const [candidateForm, setCandidateForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    workAuth: 'US Citizen',
    expectedSalary: '',
    noticePeriod: 'Immediate',
    resumeLink: '',
    skills: '',
    experience: '',
    recruiter: '',
    remarks: ''
  });

  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';
  const shouldHideAction = activeRole !== 'ADMIN' && activeRole !== 'CEO';
  const showActionColumn = activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD';
  const [clickedTextValue, setClickedTextValue] = useState<string | null>(null);

  const renderCellText = (text: string | null | undefined, _maxWidth?: number, customOnClick?: () => void) => {
    const val = text || 'N/A';
    if (val !== 'N/A' && val.length > 10) {
      const truncated = val.substring(0, 10) + '...';
      return (
        <Box
          onClick={(e) => {
            e.stopPropagation();
            if (customOnClick) {
              customOnClick();
            } else {
              setClickedTextValue(val);
            }
          }}
          sx={{
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
            userSelect: 'none',
            display: 'inline-block',
            '&:hover': {
              color: 'primary.main',
              textDecoration: 'underline'
            }
          }}
          title={customOnClick ? "Click to view details" : "Click to view full text"}
        >
          {truncated}
        </Box>
      );
    }
    return val;
  };



  const getHierarchyInfo = (recruiterEmails: string[]) => {
    const tls = new Set<string>();
    const managers = new Set<string>();

    recruiterEmails.forEach(email => {
      const u = users.find(x => x.email?.toLowerCase() === email.toLowerCase());
      if (!u) return;

      let current = u;
      let visited = new Set<string>();
      let foundTL = false;
      let foundMgr = false;

      while (current && !visited.has(current.email)) {
        visited.add(current.email);

        if (!foundTL && (current.role === 'TEAM_LEAD' || current.role === 'SUB_LEAD')) {
          tls.add(current.full_name || current.email);
          foundTL = true;
        }

        if (!foundMgr && (current.role === 'JUNIOR_MANAGER' || current.role === 'SENIOR_MANAGER')) {
          managers.add(current.full_name || current.email);
          foundMgr = true;
        }

        const parentEmail = current.reporting_to?.email || (current.reporting_to_list && current.reporting_to_list[0]?.email);
        if (parentEmail) {
          const parentUser = users.find(x => x.email?.toLowerCase() === parentEmail.toLowerCase());
          if (parentUser) {
            current = parentUser;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    });

    return {
      tl: Array.from(tls).join(', ') || '—',
      manager: Array.from(managers).join(', ') || '—'
    };
  };

  const getSalaryInfo = (remarks: string) => {
    const payRateStr = getRemarkField(remarks, 'Pay Rate');
    const salaryStr = getRemarkField(remarks, 'Salary');
    const rate = payRateStr !== 'N/A' ? payRateStr : (salaryStr !== 'N/A' ? salaryStr : '');

    if (!rate) {
      return { min: '—', max: '—', avg: '—' };
    }

    const matches = rate.match(/[\d,.]+/g);
    if (matches && matches.length >= 2) {
      const minVal = parseFloat(matches[0].replace(/,/g, ''));
      const maxVal = parseFloat(matches[1].replace(/,/g, ''));
      const avgVal = (minVal + maxVal) / 2;

      const prefix = rate.trim().startsWith('$') ? '$' : '';
      const suffix = rate.toLowerCase().includes('lpa') ? ' LPA' : '';

      return {
        min: `${prefix}${minVal}${suffix}`,
        max: `${prefix}${maxVal}${suffix}`,
        avg: `${prefix}${avgVal}${suffix}`
      };
    } else if (matches && matches.length === 1) {
      const val = parseFloat(matches[0].replace(/,/g, ''));
      const prefix = rate.trim().startsWith('$') ? '$' : '';
      const suffix = rate.toLowerCase().includes('lpa') ? ' LPA' : '';

      return {
        min: `${prefix}${val}${suffix}`,
        max: `${prefix}${val}${suffix}`,
        avg: `${prefix}${val}${suffix}`
      };
    }

    return { min: rate, max: rate, avg: rate };
  };

  // Load applications from API (Reuses Redux cache if available to prevent slow load times)
  useEffect(() => {
    const hasData = applications && applications.length > 0;
    if (hasData) {
      setLoading(false);
    } else {
      setLoading(true);
    }
    api.get('applications/').then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [dispatch]);

  // Auto-open drawer if appId is in search params
  useEffect(() => {
    if (!loading && applications.length > 0) {
      const params = new URLSearchParams(location.search);
      const appId = params.get('appId');
      if (appId) {
        const app = applications.find(a => String(a.id) === String(appId));
        if (app) {
          setSelectedApp(app);
        }
      }
    }
  }, [location.search, applications, loading]);

  // Read search and status from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const search = params.get('search');
    const status = params.get('status');
    if (search !== null) setSearchTerm(search);
    if (status !== null) setStatusFilter(status);
  }, [location.search]);

  // Filter applications based on search and selected filter and roles
  const filteredApps = applications.filter((app) => {
    // Only show applications associated with a real job requirement (Job Code is present and not N/A)
    const isJobPostingApp = getRemarkField(app.remarks, 'Job Code') !== 'N/A';
    if (!isJobPostingApp) return false;

    // 0. Date Filter (for all roles)
    const savedStart = localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr();
    const savedEnd = localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr();
    const appDate = (app.created_at || '').slice(0, 10);
    if (appDate < savedStart || appDate > savedEnd) return false;

    // Team Filter (only for ADMIN/CEO/REPORTING_TEAM)
    if ((activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'REPORTING_TEAM') && selectedTeamId !== 'ALL') {
      const assignedEmail = app.assigned_employee?.email?.toLowerCase();
      if (!assignedEmail) return false;
      const recruiterUser = users.find(u => u.email.toLowerCase() === assignedEmail);
      const isMemberOfTeam = recruiterUser?.teams?.some(t => String(t.id) === selectedTeamId);
      if (!isMemberOfTeam) return false;
    }

    // 1. Role-based restrictions
    if (activeRole === 'ASSOCIATE_ANALYST' || activeRole === 'SENIOR_ANALYST') {
      // Associates only see items assigned to them
      if (app.assigned_employee?.email?.toLowerCase() !== currentUser?.email?.toLowerCase()) return false;
    }
    
    // 2. Status Filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'HAS_CANDIDATE' && !app.candidate_name) return false;
      else if (statusFilter === 'INTERVIEWS' && !['Interview Scheduled', 'Interview Completed'].includes(app.status)) return false;
      else if (statusFilter !== 'HAS_CANDIDATE' && statusFilter !== 'INTERVIEWS' && app.status !== statusFilter) return false;
    }

    // 3. Text Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCandidate = app.candidate_name?.toLowerCase().includes(term);
      const matchClient = app.client_name.toLowerCase().includes(term);
      const matchPosition = app.position.toLowerCase().includes(term);
      const matchTech = app.technology.toLowerCase().includes(term);
      const matchAppId = String(app.id).toLowerCase().includes(term);
      const matchJobCode = getRemarkField(app.remarks, 'Job Code').toLowerCase().includes(term);
      return matchCandidate || matchClient || matchPosition || matchTech || matchAppId || matchJobCode;
    }

    return true;
  });

  const displayApps = filteredApps
    .sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Group ALL apps: by unique Job Code for Reporting Team, otherwise by position + client_name
  const groupedApps: any[] = [];
  
  if (activeRole === 'REPORTING_TEAM') {
    const seen = new Set<string>();
    displayApps.forEach(app => {
      const jobCode = getRemarkField(app.remarks, 'Job Code');
      if (jobCode === 'N/A' || !jobCode) return;
      const key = jobCode.toUpperCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        const group = applications.filter(a => {
          const code = getRemarkField(a.remarks, 'Job Code');
          return code && code.toUpperCase().trim() === key;
        });
        const rep = { ...(group.find(a => !a.candidate_name) || group[0]) };
        (rep as any).associatedIds = group.map(a => String(a.id));
        (rep as any).associatedApps = group;
        
        const employeeNames = group
          .map(a => a.assigned_employee?.full_name)
          .filter(Boolean);
        (rep as any).consolidatedAnalysts = employeeNames.length > 0 ? Array.from(new Set(employeeNames)).join(', ') : 'Unassigned';
        
        groupedApps.push(rep);
      }
    });
  } else {
    const groups: Record<string, Application[]> = {};
    displayApps.forEach(app => {
      const key = `${app.position?.toLowerCase().trim()}|${app.client_name?.toLowerCase().trim()}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(app);
    });

    Object.keys(groups).forEach(key => {
      const group = groups[key];
      const rep = { ...(
        group.find(a => !a.candidate_name) ||
        group[0]
      )};
      (rep as any).associatedIds = group.map(a => String(a.id));
      (rep as any).associatedApps = group;
      
      const employeeNames = group
        .map(a => a.assigned_employee?.full_name)
        .filter(Boolean);
      (rep as any).consolidatedAnalysts = employeeNames.length > 0 ? Array.from(new Set(employeeNames)).join(', ') : 'Unassigned';
      
      groupedApps.push(rep);
    });
  }

  // Handle redirection to edit candidate/requirement details
  const handleAppSelect = (app: Application) => {
    navigate(`/applications/create/${app.id}`);
  };

  // Submit candidate for job requirement (Associate Analyst sourcing flow)
  const handleSourceCandidateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    if (candidateForm.expectedSalary.replace(/\D/g, '').length <= 4) {
      alert('Expected Salary / Rate must be more than 4 digits.');
      return;
    }

    const fullName = `${candidateForm.firstName} ${candidateForm.lastName}`.trim();

    // Preserve the original job code so the candidate stays grouped under its parent job
    const originalJobCode = getRemarkField(selectedApp.remarks, 'Job Code');

    const formattedRemarks = `[Ciepal Candidate Details]
Job Code: ${originalJobCode !== 'N/A' ? originalJobCode : ''}
Location: ${candidateForm.location}
Work Auth: ${candidateForm.workAuth}
Expected Salary: ${candidateForm.expectedSalary}
Notice Period: ${candidateForm.noticePeriod}
Resume Link: ${candidateForm.resumeLink}
Skills: ${candidateForm.skills}
--------------------------
Remarks: ${candidateForm.remarks}`;

    const payload = {
      candidate_name: fullName,
      candidate_email: candidateForm.email,
      candidate_phone: candidateForm.phone,
      experience: parseFloat(candidateForm.experience) || selectedApp.experience,
      technology: candidateForm.skills || selectedApp.technology,
      recruiter: candidateForm.recruiter,
      remarks: formattedRemarks,
      status: 'Submitted'
    };

    try {
      const res = await api.put(`applications/${selectedApp.id}/`, payload);
      await api.post(`applications/${selectedApp.id}/add-note/`, {
        content: `Candidate Sourced: Sourced ${fullName} and submitted application for review.`
      });

      dispatch(updateApplication(res.data));
      setSelectedApp(res.data);

      dispatch(addApplicationNote({
        id: `note_log_${Date.now()}`,
        application_id: selectedApp.id,
        author: {
          id: currentUser?.id || 'sys',
          full_name: currentUser?.full_name || 'System',
          role: activeRole
        },
        content: `Candidate Sourced: Sourced ${fullName} and submitted application for review.`,
        created_at: new Date().toISOString()
      }));
    } catch (err) {
      alert("Failed to submit candidate to the database.");
    }
  };

  // Add a standard note or review comment
  const handleAddNote = async () => {
    if (!selectedApp || !newNoteText.trim()) return;

    try {
      const res = await api.post(`applications/${selectedApp.id}/add-note/`, {
        content: newNoteText
      });
      
      const newNote = {
        id: String(res.data.id),
        application_id: selectedApp.id,
        author: {
          id: res.data.author?.email || currentUser?.id || 'sys',
          full_name: res.data.author?.full_name || currentUser?.full_name || 'System',
          role: (res.data.author?.role || activeRole) as any
        },
        content: res.data.content,
        created_at: res.data.created_at
      };

      dispatch(addApplicationNote(newNote));
    } catch (err) {
      alert("Failed to add note.");
    }

    setNewNoteText('');
  };

  // Update applicant recruitment pipeline status
  const handleStatusChange = async (status: ApplicationStatus) => {
    if (!selectedApp) return;
    
    try {
      const res = await api.patch(`applications/${selectedApp.id}/`, { status });
      await api.post(`applications/${selectedApp.id}/add-note/`, {
        content: `Status updated to ${status}.`
      });

      dispatch(changeApplicationStatus({ id: selectedApp.id, status }));
      setSelectedApp(res.data);

      dispatch(addApplicationNote({
        id: `note_status_${Date.now()}`,
        application_id: selectedApp.id,
        author: {
          id: currentUser?.id || 'sys',
          full_name: currentUser?.full_name || 'System',
          role: activeRole
        },
        content: `Status updated to ${status}.`,
        created_at: new Date().toISOString()
      }));
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['ID', 'Candidate Name', 'Candidate Email', 'Candidate Phone', 'Client Name', 'Position', 'Technology', 'Experience', 'Assigned Analyst', 'Status', 'Updated At'];
    const rows = groupedApps.map(app => [
      app.id,
      app.candidate_name || 'N/A',
      app.candidate_email || 'N/A',
      app.candidate_phone || 'N/A',
      app.client_name,
      app.position,
      app.technology,
      app.experience,
      app.consolidatedAnalysts || 'Unassigned',
      app.status,
      new Date(app.updated_at).toLocaleDateString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ats_applications_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusChipColor = (status: string) => {
    const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'warning' | 'success' | 'error' | 'info'> = {
      'New': 'info',
      'Submitted': 'primary',
      'Under Review': 'warning',
      'Interview Scheduled': 'secondary',
      'Interview Completed': 'secondary',
      'Selected': 'success',
      'Rejected': 'error',
      'On Hold': 'default',
      'Closed': 'default'
    };
    return statusColors[status] || 'default';
  };

  if (loading && applications.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 5 }}>
      {/* Title */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
              Job Postings Pipeline
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Manage and track all job postings and requirements created by your team.
            </Typography>
        </Box>
        <Button 
          variant="outlined" 
          startIcon={<Download size={18} />} 
          onClick={handleExportCSV}
          sx={{ borderRadius: '8px', borderWeight: 2 }}
        >
          Export CSV Pipeline
        </Button>
      </Box>

      {/* Filter panel */}
      <Card sx={{ p: 2, mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={(currentUser?.role === 'ADMIN' || currentUser?.role === 'CEO') ? 6 : 9}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by position, client, candidate name or technology stack..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <Search size={16} style={{ marginRight: 8, color: '#94a3b8' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Pipeline Status</InputLabel>
              <Select
                value={statusFilter}
                label="Pipeline Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value="New">New / Unassigned</MenuItem>
                <MenuItem value="Submitted">Submitted</MenuItem>
                <MenuItem value="Under Review">Under Review</MenuItem>
                <MenuItem value="Interview Scheduled">Interview Scheduled</MenuItem>
                <MenuItem value="Interview Completed">Interview Completed</MenuItem>
                <MenuItem value="Selected">Selected / Offered</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
                <MenuItem value="On Hold">On Hold</MenuItem>
                <MenuItem value="Closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CEO' || currentUser?.role === 'REPORTING_TEAM') && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Team</InputLabel>
                <Select
                  value={selectedTeamId}
                  label="Filter by Team"
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  <MenuItem value="ALL">All Teams</MenuItem>
                  {teamsList.map(team => (
                    <MenuItem key={team.id} value={String(team.id)}>{team.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

        </Grid>
      </Card>

      <Card>
        <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#101726' }}>
                <th style={{ width: '50px', padding: '6px 8px', whiteSpace: 'nowrap' }}></th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Code</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Title</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Client</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Location</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Status</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Client Bill Rate / Salary</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Pay Rate / Salary</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Manager</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>TL</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Recruiter</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Created Date</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Min Sal</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Max Sal</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Avg Sal</th>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Modified By</th>
                {showActionColumn && (
                  <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {groupedApps.map((app) => {
                const jobCodeVal = getRemarkField(app.remarks, 'Job Code');
                // Stable key always based on position+client (matches grouping logic)
                const jobCodeKey = `${app.position?.toLowerCase().trim()}|${app.client_name?.toLowerCase().trim()}`;
                const jobApplicants = applications.filter(a =>
                  a.candidate_name &&
                  a.position?.toLowerCase().trim() === app.position?.toLowerCase().trim() &&
                  a.client_name?.toLowerCase().trim() === app.client_name?.toLowerCase().trim()
                );

                const recruiterEmails = app.associatedApps?.map((a: any) => a.assigned_employee?.email?.toLowerCase()).filter(Boolean) || [];
                const recruitersText = Array.from(new Set(
                  app.associatedApps
                    ?.map((a: any) => a.assigned_employee?.full_name || a.recruiter)
                    .filter(Boolean)
                )).join(', ');
                const hierarchyInfo = getHierarchyInfo(recruiterEmails);
                const creationDateText = app.created_at ? new Date(app.created_at).toLocaleString('en-US', { hour12: true }) : '—';
                const salaryInfo = getSalaryInfo(app.remarks || '');
                const isExpanded = !!expandedJobs[jobCodeKey];

                return (
                  <React.Fragment key={app.id}>
                     <tr 
                      style={{ borderBottom: isExpanded ? 'none' : `1px solid ${theme.palette.divider}`, transition: 'background-color 0.2s', whiteSpace: 'nowrap' }}
                      onMouseEnter={(e) => {
                         e.currentTarget.style.backgroundColor = theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b';
                      }}
                      onMouseLeave={(e) => {
                         e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
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
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', color: jobCodeVal !== 'N/A' ? 'inherit' : 'text.disabled' }}>
                          {renderCellText(jobCodeVal !== 'N/A' ? jobCodeVal : '—', 95)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'primary.main',
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => {
                            navigate(`/jobs/${app.id}/details`);
                          }}
                        >
                          {renderCellText(app.position, 140, () => navigate(`/jobs/${app.id}/details`))}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                          <Building size={14} /> {renderCellText(app.client_name, 120)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {(() => {
                            const loc = getRemarkField(app.remarks, 'Location');
                            const val = loc !== 'N/A' ? loc : [app.city, app.state].filter(Boolean).join(', ') || '—';
                            return renderCellText(val, 120);
                          })()}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {currentUser?.role === 'ASSOCIATE_ANALYST' || currentUser?.role === 'SENIOR_ANALYST' ? (
                          <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                            {getRemarkField(app.remarks, 'Job Status')}
                          </Typography>
                        ) : (
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem', 
                              color: getRemarkField(app.remarks, 'Job Status') === 'Active' ? 'success.main' : 'text.secondary',
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setJobStatusUpdateApp(app);
                              setJobStatusUpdateValue(getRemarkField(app.remarks, 'Job Status') || 'Active');
                            }}
                          >
                            {getRemarkField(app.remarks, 'Job Status')}
                          </Typography>
                        )}
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {(() => {
                            const billRate = getRemarkField(app.remarks, 'Client Bill Rate');
                            if (billRate !== 'N/A') return renderCellText(billRate, 100);
                            const salary = getRemarkField(app.remarks, 'Salary');
                            if (salary !== 'N/A') return renderCellText(salary, 100);
                            return '—';
                          })()}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {(() => {
                            const payRate = getRemarkField(app.remarks, 'Pay Rate');
                            if (payRate !== 'N/A') return renderCellText(payRate, 100);
                            return '—';
                          })()}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(hierarchyInfo.manager, 110)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(hierarchyInfo.tl, 110)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(recruitersText, 120)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(creationDateText, 140)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(salaryInfo.min, 100)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(salaryInfo.max, 100)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {renderCellText(salaryInfo.avg, 100)}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {renderCellText(app.modified_by || 'N/A', 110)}
                        </Typography>
                      </td>
                      {showActionColumn && (
                        <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontSize: '0.75rem', fontWeight: 700 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAppSelect(app);
                              }}
                            >
                              Edit
                            </Typography>
                            {!shouldHideAction && (
                              <Typography 
                                variant="body2" 
                                sx={{ color: 'error.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontSize: '0.75rem', fontWeight: 700 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const group = app.associatedApps || [];
                                  if (window.confirm(`Are you sure you want to delete the job requirement "${app.position}" and all of its ${group.length} candidate submissions?`)) {
                                    try {
                                      for (const sub of group) {
                                        await api.delete(`applications/${sub.id}/`);
                                        dispatch(deleteApplication(String(sub.id)));
                                      }
                                    } catch (err) {
                                      alert("Failed to delete some records.");
                                    }
                                  }
                                }}
                              >
                                Delete
                              </Typography>
                            )}
                          </Box>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr style={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                        <td colSpan={shouldHideAction ? 16 : 17} style={{ padding: '12px 16px' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
                        APPLICANTS ({jobApplicants.length})
                      </Typography>
                      {jobApplicants.length === 0 ? (
                        <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', py: 1 }}>
                          No applicants have been sourced for this job requirement.
                        </Typography>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: '6px', overflow: 'hidden' }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant ID</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant Name</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Email</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Code</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>City</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>State</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant Status</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Title</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Recruiter</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>PAN Card</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Aadhaar</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Alt Mobile</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Source</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Interest to Work</th>
                              <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Modified By</th>
                              {showActionColumn && <th style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {jobApplicants.map((applicant) => (
                              <tr key={applicant.id} style={{ borderBottom: `1px solid ${theme.palette.divider}`, whiteSpace: 'nowrap' }}>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{applicant.id}</td>
                                {activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'REPORTING_TEAM' ? (
                                   <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.primary, whiteSpace: 'nowrap' }}>
                                     {renderCellText(applicant.candidate_name, 120)}
                                   </td>
                                 ) : (
                                   <td 
                                     style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.primary.main, whiteSpace: 'nowrap', cursor: 'pointer' }}
                                     onClick={() => navigate(`/candidates/${applicant.id}/details`)}
                                   >
                                     {renderCellText(applicant.candidate_name, 120, () => navigate(`/candidates/${applicant.id}/details`))}
                                   </td>
                                 )}
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.candidate_email, 130)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(getRemarkField(applicant.remarks, 'Job Code'), 90)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.city, 90)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.state, 90)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setStatusUpdateApp(applicant);
                                      setStatusUpdateValue(applicant.status as ApplicationStatus);
                                      setStatusUpdateComment('');
                                    }}
                                  >
                                    {applicant.status}
                                  </Typography>
                                </td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.position, 140)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.recruiter || applicant.assigned_employee?.full_name || 'System', 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.pan_card, 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.aadhaar, 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.alternate_mobile_number, 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.source, 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.interest_to_work_for_client, 110)}</td>
                                <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{renderCellText(applicant.modified_by || 'N/A', 110)}</td>
                                {showActionColumn && (
                                  <td style={{ padding: '4px 8px', fontSize: '0.7rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
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
                                      {!shouldHideAction && (
                                        <Typography
                                          variant="body2"
                                          sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'error.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Are you sure you want to delete this applicant submission?`)) {
                                              try {
                                                await api.delete(`applications/${applicant.id}/`);
                                                dispatch(deleteApplication(String(applicant.id)));
                                              } catch (err) {
                                                alert("Failed to delete application.");
                                              }
                                            }
                                          }}
                                        >
                                          Delete
                                        </Typography>
                                      )}
                                    </Box>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
            {groupedApps.length === 0 && (
                <tr>
                  <td colSpan={shouldHideAction ? 8 : 9} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    No applications match the active filters or search terms.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Card>

      {/* ========================================================
          CANDIDATE DETAILS AND PIPELINE MANAGER SIDE-DRAWER
          ======================================================== */}
      <Drawer
        anchor="right"
        open={selectedApp !== null}
        onClose={() => setSelectedApp(null)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 520 }, p: 3, borderLeft: `1px solid ${theme.palette.divider}` }
        }}
      >
        {selectedApp && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={800}>
                {isEditing ? 'Edit Details' : 'Application Details'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {!isEditing && (activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD') && (
                  <Button 
                    variant="outlined" 
                    size="small" 
                    onClick={handleStartEdit}
                    sx={{ borderRadius: '6px', fontWeight: 700 }}
                  >
                    Edit Info
                  </Button>
                )}
                <IconButton onClick={() => {
                  setSelectedApp(null);
                  setIsEditing(false);
                }}>
                  <X size={20} />
                </IconButton>
              </Box>
            </Box>
            <Divider sx={{ mb: 2.5 }} />

            {isEditing ? (
              <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={750} color="primary">
                    Candidate Information
                  </Typography>
                  <TextField
                    label="Candidate Name"
                    fullWidth
                    size="small"
                    value={editForm.candidateName}
                    onChange={(e) => setEditForm({ ...editForm, candidateName: e.target.value })}
                  />
                  <TextField
                    label="Candidate Email"
                    fullWidth
                    size="small"
                    value={editForm.candidateEmail}
                    onChange={(e) => setEditForm({ ...editForm, candidateEmail: e.target.value })}
                  />
                  <TextField
                    label="Candidate Phone"
                    fullWidth
                    size="small"
                    value={editForm.candidatePhone}
                    onChange={(e) => setEditForm({ ...editForm, candidatePhone: e.target.value })}
                  />
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" fontWeight={750} color="primary">
                    Job Requirement Details
                  </Typography>
                  <TextField
                    label="Technology / Stack"
                    fullWidth
                    size="small"
                    value={editForm.technology}
                    onChange={(e) => setEditForm({ ...editForm, technology: e.target.value })}
                  />
                  <TextField
                    label="Experience (Years)"
                    type="number"
                    inputProps={{ step: '0.5', min: '0' }}
                    fullWidth
                    size="small"
                    value={editForm.experience}
                    onChange={(e) => setEditForm({ ...editForm, experience: e.target.value })}
                  />
                  <TextField
                    label="Job Description"
                    fullWidth
                    multiline
                    rows={6}
                    size="small"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                  
                  <Box sx={{ display: 'flex', gap: 2, mt: 3, mb: 2 }}>
                    <Button 
                      variant="outlined" 
                      fullWidth
                      onClick={() => setIsEditing(false)}
                      sx={{ borderRadius: '8px' }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="contained" 
                      color="success"
                      fullWidth
                      onClick={handleSaveEdit}
                      sx={{ borderRadius: '8px', fontWeight: 700 }}
                    >
                      Save Changes
                    </Button>
                  </Box>
                </Box>
              </Box>
            ) : (
              <>
                {/* Position info card */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: '12px', bgcolor: 'action.hover' }}>
                  <Typography variant="subtitle2" fontWeight={750} color="primary" display="block">
                    {selectedApp.position}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                    Client: {selectedApp.client_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Stack: {selectedApp.technology} • Req Experience: {selectedApp.experience} yrs
                  </Typography>
                </Paper>

                {/* ==========================================
                    FLOW 1: ASSOCIATE SOURCING ENTRY FORM
                    If status is New, we show a form for the associate to enter candidate details.
                    ========================================== */}
                {selectedApp.status === 'New' && (
              <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
                <Alert severity="info" sx={{ mb: 2.5, borderRadius: '8px' }}>
                  <strong>New requirement assigned.</strong> Sourced candidates must be added here to be submitted to this client.
                </Alert>
                <form onSubmit={handleSourceCandidateSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <TextField
                          label="First Name"
                          required
                          fullWidth
                          value={candidateForm.firstName}
                          onChange={(e) => setCandidateForm({ ...candidateForm, firstName: e.target.value })}
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Last Name"
                          required
                          fullWidth
                          value={candidateForm.lastName}
                          onChange={(e) => setCandidateForm({ ...candidateForm, lastName: e.target.value })}
                          size="small"
                        />
                      </Grid>
                    </Grid>
                    <TextField
                      label="Candidate Email"
                      required
                      type="email"
                      fullWidth
                      value={candidateForm.email}
                      onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                      size="small"
                    />
                    <TextField
                      label="Candidate Phone Number"
                      required
                      fullWidth
                      value={candidateForm.phone}
                      onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                      placeholder="+1 (555) 019-9234"
                      size="small"
                    />
                    <TextField
                      label="Current Location"
                      required
                      fullWidth
                      value={candidateForm.location}
                      onChange={(e) => setCandidateForm({ ...candidateForm, location: e.target.value })}
                      placeholder="City, State"
                      size="small"
                    />
                    <FormControl fullWidth size="small" required>
                      <InputLabel>Work Authorization</InputLabel>
                      <Select
                        value={candidateForm.workAuth}
                        label="Work Authorization"
                        onChange={(e) => setCandidateForm({ ...candidateForm, workAuth: e.target.value })}
                      >
                        <MenuItem value="US Citizen">US Citizen</MenuItem>
                        <MenuItem value="Green Card">Green Card</MenuItem>
                        <MenuItem value="H1B">H1B</MenuItem>
                        <MenuItem value="OPT/CPT">OPT / CPT</MenuItem>
                        <MenuItem value="H4 EAD">H4 EAD</MenuItem>
                        <MenuItem value="GC EAD">GC EAD</MenuItem>
                        <MenuItem value="L2 EAD">L2 EAD</MenuItem>
                        <MenuItem value="TN Visa">TN Visa</MenuItem>
                        <MenuItem value="Other">Other / Authorized</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Expected Salary / Rate"
                      required
                      fullWidth
                      value={candidateForm.expectedSalary}
                      onChange={(e) => setCandidateForm({ ...candidateForm, expectedSalary: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 110000"
                      size="small"
                    />
                    <FormControl fullWidth size="small" required>
                      <InputLabel>Notice Period</InputLabel>
                      <Select
                        value={candidateForm.noticePeriod}
                        label="Notice Period"
                        onChange={(e) => setCandidateForm({ ...candidateForm, noticePeriod: e.target.value })}
                      >
                        <MenuItem value="Immediate">Immediate / Serving Notice</MenuItem>
                        <MenuItem value="1 Week">1 Week</MenuItem>
                        <MenuItem value="2 Weeks">2 Weeks</MenuItem>
                        <MenuItem value="30 Days">30 Days</MenuItem>
                        <MenuItem value="60 Days">60 Days</MenuItem>
                        <MenuItem value="90 Days">90 Days</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Key Skills / Tech Stack"
                      required
                      fullWidth
                      value={candidateForm.skills}
                      onChange={(e) => setCandidateForm({ ...candidateForm, skills: e.target.value })}
                      size="small"
                    />
                    <TextField
                      label="Years of Experience"
                      required
                      fullWidth
                      type="number"
                      inputProps={{ step: '0.5', min: '0' }}
                      value={candidateForm.experience}
                      onChange={(e) => setCandidateForm({ ...candidateForm, experience: e.target.value })}
                      size="small"
                    />
                    <TextField
                      label="Resume Document URL"
                      fullWidth
                      value={candidateForm.resumeLink}
                      onChange={(e) => setCandidateForm({ ...candidateForm, resumeLink: e.target.value })}
                      placeholder="Google Drive, Dropbox, etc."
                      size="small"
                    />
                    <TextField
                      label="Recruiter Name"
                      fullWidth
                      value={candidateForm.recruiter}
                      onChange={(e) => setCandidateForm({ ...candidateForm, recruiter: e.target.value })}
                      size="small"
                    />
                    <TextField
                      label="Sourcing Remarks & Evaluation Notes"
                      multiline
                      rows={3}
                      fullWidth
                      value={candidateForm.remarks}
                      onChange={(e) => setCandidateForm({ ...candidateForm, remarks: e.target.value })}
                      placeholder="Notes about candidate screening, availability, etc."
                      size="small"
                    />
                    <Button 
                      variant="contained" 
                      color="success" 
                      type="submit" 
                      fullWidth
                      sx={{ mt: 1, py: 1.2, fontWeight: 700 }}
                      startIcon={<Check size={18} />}
                    >
                      Submit Candidate
                    </Button>
                  </Box>
                </form>
              </Box>
            )}

            {/* ==========================================
                FLOW 2: STANDARD CANDIDATE REVIEW & TIMELINE
                If candidate is sourced, show candidate profile and pipeline updates.
                ========================================== */}
            {selectedApp.status !== 'New' && (
              <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {/* Scrollable Content Area */}
                <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5, display: 'flex', flexDirection: 'column', gap: 3, mb: 2 }}>
                  {/* Candidate Profile Details */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
                      Candidate Profile
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <Avatar sx={{ bgcolor: 'secondary.main', width: 40, height: 40 }}>
                          {selectedApp.candidate_name?.charAt(0) || 'C'}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={750}>{selectedApp.candidate_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{selectedApp.candidate_email}</Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                        <strong>Phone:</strong> {selectedApp.candidate_phone}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem', mt: 0.5 }}>
                        <strong>Source:</strong> {selectedApp.recruiter || 'Self'}
                      </Typography>
                    </Paper>
                  </Box>

                  {/* Pipeline Status Action Box */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
                      Transition Pipeline Status
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                       {(['New', 'Submitted', 'Placed', 'Under Review', 'Interview Scheduled', 'Interview Completed', 'Selected', 'Rejected', 'On Hold', 'Closed'] as ApplicationStatus[]).map((statusOption) => (
                        <Chip
                          key={statusOption}
                          label={statusOption}
                          clickable
                          onClick={() => handleStatusChange(statusOption)}
                          color={selectedApp.status === statusOption ? getStatusChipColor(statusOption) : 'default'}
                          variant={selectedApp.status === statusOption ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Timeline Notes */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
                      Comments & Timeline History
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {(notes[selectedApp.id] || []).map((note) => (
                        <Box key={note.id} sx={{ display: 'flex', gap: 1.5 }}>
                          <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#4f46e5', color: 'white' }}>
                            {note.author.full_name.charAt(0)}
                          </Avatar>
                          <Box sx={{ flexGrow: 1 }}>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '10px 10px 10px 10px', bgcolor: 'background.paper' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="caption" fontWeight={750}>{note.author.full_name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
                                {note.content}
                              </Typography>
                            </Paper>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2, pl: 0.5 }}>
                              {note.author.role.replace('_', ' ')}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                      {(notes[selectedApp.id] || []).length === 0 && (
                        <Box sx={{ p: 2, textAlign: 'center', color: '#94a3b8' }}>
                          <BookOpen size={24} style={{ opacity: 0.4, marginBottom: 4 }} />
                          <Typography variant="caption" display="block">No activity log entries or notes yet.</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Add Note Footer (Pinned at the bottom) */}
                <Box sx={{ display: 'flex', gap: 1, pt: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Type review note, feedback or remarks..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                  />
                  <IconButton 
                    color="primary" 
                    onClick={handleAddNote}
                    disabled={!newNoteText.trim()}
                    sx={{ bgcolor: 'primary.light', '&:hover': { bgcolor: 'primary.main', color: 'white' } }}
                  >
                    <MessageSquare size={16} />
                  </IconButton>
                </Box>
              </Box>
            )}
              </>
            )}

          </Box>
        )}
      </Drawer>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog
        open={deleteAppConfirm !== null}
        onClose={() => setDeleteAppConfirm(null)}
        PaperProps={{
          sx: { borderRadius: '12px', p: 1 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Are you sure you want to delete this job requirement/application? This action is permanent and cannot be undone.
          </DialogContentText>
          {deleteAppConfirm && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: '8px', bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={750} color="primary">
                {deleteAppConfirm.position}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Client: {deleteAppConfirm.client_name}
              </Typography>
              {deleteAppConfirm.candidate_name && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Candidate:</strong> {deleteAppConfirm.candidate_name}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Assigned Analyst: {deleteAppConfirm.assigned_employee?.full_name || 'Unassigned'}
              </Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setDeleteAppConfirm(null)} 
            variant="outlined" 
            sx={{ borderRadius: '8px' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmDelete} 
            color="error" 
            variant="contained" 
            sx={{ borderRadius: '8px', fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* JOB STATUS UPDATE DIALOG */}
      <Dialog
        open={jobStatusUpdateApp !== null}
        onClose={() => setJobStatusUpdateApp(null)}
        PaperProps={{
          sx: { borderRadius: '12px', p: 1, minWidth: 320 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          Update Job Status
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Change the status of this job posting.
          </DialogContentText>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Job Status</InputLabel>
            <Select
              value={jobStatusUpdateValue}
              label="Job Status"
              onChange={(e) => setJobStatusUpdateValue(e.target.value)}
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setJobStatusUpdateApp(null)} 
            variant="outlined" 
            sx={{ borderRadius: '8px' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={async () => {
              if (!jobStatusUpdateApp) return;
              try {
                const idsToUpdate = jobStatusUpdateApp.associatedIds || [String(jobStatusUpdateApp.id)];
                for (const id of idsToUpdate) {
                  const targetApp = jobStatusUpdateApp.associatedApps?.find((a: any) => String(a.id) === String(id)) || jobStatusUpdateApp;
                  let currentStatus = 'Active';
                  if (targetApp.remarks && targetApp.remarks.includes('Job Status:')) {
                    const lines = targetApp.remarks.split('\n');
                    const statusLine = lines.find((l: string) => l.startsWith('Job Status:'));
                    currentStatus = statusLine ? statusLine.replace('Job Status:', '').trim() : 'Active';
                  }

                  let newRemarks = targetApp.remarks || '';
                  if (targetApp.remarks && targetApp.remarks.includes('Job Status:')) {
                    newRemarks = targetApp.remarks.replace(`Job Status: ${currentStatus}`, `Job Status: ${jobStatusUpdateValue}`);
                  } else {
                    newRemarks = `[Job Details]\nJob Status: ${jobStatusUpdateValue}\n${newRemarks}`;
                  }

                  const res = await api.patch(`applications/${id}/`, { remarks: newRemarks });
                  dispatch(updateApplication(res.data));
                }
                setJobStatusUpdateApp(null);
              } catch (err) {
                alert("Failed to update job status.");
              }
            }} 
            color="success" 
            variant="contained" 
            sx={{ borderRadius: '8px', fontWeight: 700 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* UPDATE PIPELINE STATUS DIALOG */}
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
                  <MenuItem value="Placed">Placed</MenuItem>
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

      {/* VIEW FULL VALUE DIALOG */}
      <Dialog open={!!clickedTextValue} onClose={() => setClickedTextValue(null)}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Full Value</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ wordBreak: 'break-word', userSelect: 'text' }}>
            {clickedTextValue}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClickedTextValue(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

