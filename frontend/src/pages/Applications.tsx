import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Search,
  Download,
  Check,
  RefreshCw
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { changeApplicationStatus, addApplicationNote, setApplications, deleteApplication, updateApplication } from '../redux/applicationsSlice';
import { Application, ApplicationStatus } from '../types';
import { api } from '../services/api';

export const Applications: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const location = useLocation();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications } = useAppSelector(state => state.applications);
  const { users } = useAppSelector(state => state.users);

  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTeamId, setSelectedTeamId] = useState('ALL');
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});

  const todayStr = (): string => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const getRemarkField = (remarks: string, fieldName: string): string => {
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

  // Status update financial form fields
  const [payRateInput, setPayRateInput] = useState('');
  const [grossRevenueInput, setGrossRevenueInput] = useState('');
  const [taxesInput, setTaxesInput] = useState('');
  const [tdsInput, setTdsInput] = useState('');
  const [invoiceAmountInput, setInvoiceAmountInput] = useState('');
  const [profitAmountInput, setProfitAmountInput] = useState('');
  const [dateOfJoinInput, setDateOfJoinInput] = useState('');

  // Deletion confirmation state
  const [deleteAppConfirm, setDeleteAppConfirm] = useState<Application | null>(null);

  // Status update modal state
  const [statusUpdateApp, setStatusUpdateApp] = useState<Application | null>(null);
  const [statusUpdateValue, setStatusUpdateValue] = useState<ApplicationStatus>('New');
  const [statusUpdateComment, setStatusUpdateComment] = useState('');
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
      let current = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      while (current) {
        if (current.role === 'TEAM_LEAD' || current.role === 'SUB_LEAD') {
          tls.add(current.full_name || current.email);
        }
        if (current.role === 'JUNIOR_MANAGER' || current.role === 'SENIOR_MANAGER') {
          managers.add(current.full_name || current.email);
        }

        const parentEmail = current.reporting_to?.email || (current.reporting_to_list && current.reporting_to_list[0]?.email);
        if (parentEmail) {
          const parentUser = users.find((x: any) => x.email?.toLowerCase() === parentEmail.toLowerCase());
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
      tl: Array.from(tls).join(', ') || 'N/A',
      manager: Array.from(managers).join(', ') || 'N/A'
    };
  };

  const handleConfirmDelete = async () => {
    if (!deleteAppConfirm) return;
    try {
      await api.delete(`applications/${deleteAppConfirm.id}/`);
      dispatch(deleteApplication(String(deleteAppConfirm.id)));
      setDeleteAppConfirm(null);
    } catch (err) {
      alert("Failed to delete application requirement.");
    }
  };

  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';
  const isReadOnly = activeRole === 'REPORTING_TEAM';
  const shouldHideAction = activeRole !== 'ADMIN' && activeRole !== 'CEO';
  const showActionColumn = activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD';

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
    }).catch(() => { })
      .finally(() => setLoading(false));
  }, [dispatch]);

  // Handle drawer open
  const handleAppSelect = (app: Application) => {
    if (!app.candidate_name) {
      // It's a new requirement, navigate to candidate creation
      window.open(`/candidates/create/${app.id}`, '_blank');
      return;
    }
    // Navigate to the dedicated candidate details page
    navigate(`/candidates/${app.id}/details`);
  };

  // Read search and status from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const search = params.get('search');
    const status = params.get('status');
    if (search !== null) setSearchTerm(search);
    if (status !== null) setStatusFilter(status);
  }, [location.search]);

  const teamsList = useMemo(() => {
    const unique = new Map();
    users.flatMap(u => u.teams || []).filter(t => t && t.id).forEach(t => {
      unique.set(String(t.id), t);
    });
    return Array.from(unique.values());
  }, [users]);

  // Filter applications based on search and selected filter and roles
  const filteredApps = applications.filter((app) => {
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
      // Associates see items assigned to them OR recruited by them
      const isAssignee = app.assigned_employee?.email?.toLowerCase() === currentUser?.email?.toLowerCase();
      const isRecruiterName = app.recruiter?.toLowerCase() === currentUser?.full_name?.toLowerCase();
      const isRecruiterEmail = app.recruiter?.toLowerCase() === currentUser?.email?.toLowerCase();
      if (!isAssignee && !isRecruiterName && !isRecruiterEmail) return false;
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
      const matchEmail = app.candidate_email?.toLowerCase().includes(term);
      const matchPhone = app.candidate_phone?.toLowerCase().includes(term);
      const matchClient = app.client_name.toLowerCase().includes(term);
      const matchPosition = app.position.toLowerCase().includes(term);
      const matchTech = app.technology.toLowerCase().includes(term);
      const matchAppId = String(app.id).toLowerCase().includes(term);
      const matchJobCode = getRemarkField(app.remarks, 'Job Code').toLowerCase().includes(term);
      return matchCandidate || matchEmail || matchPhone || matchClient || matchPosition || matchTech || matchAppId || matchJobCode;
    }

    return true;
  });

  const displayApps = filteredApps.filter(app => app.candidate_name);

  const candidateGroups = useMemo(() => {
    const groups: Record<string, typeof displayApps> = {};
    displayApps.forEach(app => {
      const key = app.candidate_email?.toLowerCase() || app.candidate_name?.toLowerCase() || `unknown_${app.id}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(app);
    });
    return groups;
  }, [displayApps]);

  const uniqueCandidates = useMemo(() => {
    return Object.entries(candidateGroups).map(([key, apps]) => {

      // Filter out 'N/A' job codes from submissions IF there is at least one real job code assigned
      const hasRealJob = apps.some(a => getRemarkField(a.remarks, 'Job Code') !== 'N/A');
      const filteredSubmissions = hasRealJob 
        ? apps.filter(a => getRemarkField(a.remarks, 'Job Code') !== 'N/A')
        : [];

      // Deduplicate submissions by Job Code so the same job is not listed twice
      const seenJobCodes = new Set<string>();
      const uniqueSubmissions = filteredSubmissions.filter(a => {
        const code = getRemarkField(a.remarks, 'Job Code');
        if (code === 'N/A') return true;
        if (seenJobCodes.has(code)) return false;
        seenJobCodes.add(code);
        return true;
      });

      return {
        key,
        primaryApp: (() => {
          const sortedByResume = [...apps].sort((a, b) => {
            const aHasResume = (a.remarks || '').toLowerCase().includes('resume link');
            const bHasResume = (b.remarks || '').toLowerCase().includes('resume link');
            if (aHasResume !== bHasResume) return aHasResume ? -1 : 1;
            return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
          });
          return sortedByResume[0];
        })(),
        allSubmissions: uniqueSubmissions
      };
    });
  }, [candidateGroups]);

  const handleUpdateStatusSubmit = async () => {
    if (!statusUpdateApp) return;
    try {
      let updatedRemarks = statusUpdateApp.remarks || '';
      if (statusUpdateValue === 'Offer Sent') {
        const fieldsToUpdate: Record<string, string> = {
          'Pay Rate': payRateInput.trim(),
          'Gross Revenue': grossRevenueInput.trim(),
          'Taxes': taxesInput.trim(),
          'TDS': tdsInput.trim(),
          'Invoice Amount': invoiceAmountInput.trim(),
          'Profit Amount': profitAmountInput.trim(),
          'Date of Join': dateOfJoinInput.trim()
        };

        Object.entries(fieldsToUpdate).forEach(([key, val]) => {
          if (!val) return;
          const regex = new RegExp(`^${key}:.*$`, 'im');
          if (regex.test(updatedRemarks)) {
            updatedRemarks = updatedRemarks.replace(regex, `${key}: ${val}`);
          } else {
            updatedRemarks = updatedRemarks ? `${updatedRemarks}\n${key}: ${val}` : `${key}: ${val}`;
          }
        });
      }

      const patchPayload: any = { status: statusUpdateValue };
      if (statusUpdateValue === 'Offer Sent') {
        patchPayload.remarks = updatedRemarks;
      }

      const res = await api.patch(`applications/${statusUpdateApp.id}/`, patchPayload);
      const updatedAppFromBackend = res.data;

      const commentMsg = statusUpdateComment ? `\nComment: ${statusUpdateComment}` : '';
      await api.post(`applications/${statusUpdateApp.id}/add-note/`, {
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`
      });

      if (updatedAppFromBackend && updatedAppFromBackend.id) {
        dispatch(updateApplication(updatedAppFromBackend));
      } else {
        dispatch(changeApplicationStatus({ id: statusUpdateApp.id, status: statusUpdateValue }));
      }

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

  // CSV Export matching exact page display & filters
  const handleExportCSV = () => {
    const headers = [
      'Applicant ID',
      'Applicant Name',
      'Email',
      'Job Code',
      'City',
      'State',
      'Applicant Status',
      'Job Title',
      'Job Type',
      'Client Name',
      'Tentative Start Date',
      'Manager',
      'Team Lead',
      'Recruiter',
      'PAN Card',
      'Aadhaar',
      'Alt Mobile',
      'Source',
      'Interest to Work',
      'Modified By',
      'Pay Rate',
      'Gross Revenue',
      'Taxes',
      'TDS',
      'Invoice Amount',
      'Profit Amount',
      'Date of Join'
    ];

    const rows = uniqueCandidates.map((cand) => {
      const app = cand.primaryApp;
      const directJobCode = getRemarkField(app.remarks, 'Job Code');
      const realSubmission = cand.allSubmissions.find(s => getRemarkField(s.remarks, 'Job Code') !== 'N/A');
      const displayJobCode = directJobCode !== 'N/A' ? directJobCode : (realSubmission ? getRemarkField(realSubmission.remarks, 'Job Code') : 'N/A');
      const displayPosition = (app.position && app.position !== 'N/A') ? app.position : (realSubmission ? realSubmission.position : 'N/A');
      const jobPosting = applications.find(a => !a.candidate_name && getRemarkField(a.remarks, 'Job Code') === displayJobCode);
      const displayJobType = jobPosting ? getRemarkField(jobPosting.remarks, 'Job Type') : 'N/A';
      const displayClientName = (app.client_name && app.client_name !== 'N/A') ? app.client_name : (jobPosting ? jobPosting.client_name : (realSubmission ? realSubmission.client_name : 'N/A'));
      const displayStartDate = jobPosting ? getRemarkField(jobPosting.remarks, 'Start Date') : 'N/A';

      const siblingApps = applications.filter(a => !a.candidate_name && getRemarkField(a.remarks, 'Job Code') === displayJobCode);
      const recruiterEmails = siblingApps.map(a => a.assigned_employee?.email).filter(Boolean) as string[];
      if (recruiterEmails.length === 0 && app.assigned_employee?.email) {
        recruiterEmails.push(app.assigned_employee.email);
      }
      const hierarchyInfo = getHierarchyInfo(recruiterEmails);

      return [
        app.id,
        app.candidate_name || 'N/A',
        app.candidate_email || 'N/A',
        displayJobCode,
        app.city || 'N/A',
        app.state || 'N/A',
        app.status || 'N/A',
        displayPosition,
        displayJobType,
        displayClientName,
        displayStartDate,
        hierarchyInfo.manager,
        hierarchyInfo.tl,
        app.recruiter || app.assigned_employee?.full_name || 'System',
        app.pan_card || 'N/A',
        app.aadhaar || 'N/A',
        app.alternate_mobile_number || 'N/A',
        app.source || 'N/A',
        app.interest_to_work_for_client || 'N/A',
        app.modified_by || 'System',
        getRemarkField(app.remarks, 'Pay Rate'),
        getRemarkField(app.remarks, 'Gross Revenue'),
        getRemarkField(app.remarks, 'Taxes'),
        getRemarkField(app.remarks, 'TDS'),
        getRemarkField(app.remarks, 'Invoice Amount'),
        getRemarkField(app.remarks, 'Profit Amount'),
        getRemarkField(app.remarks, 'Date of Join')
      ];
    });

    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvContent = [
      headers.map(escapeCell).join(','),
      ...rows.map(row => row.map(escapeCell).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `applicants_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {(activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD' || activeRole === 'ASSOCIATE_ANALYST' || activeRole === 'SENIOR_ANALYST' || activeRole === 'CEO') ? 'Applicants' : 'Applications & Job Postings'}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Sift, track, and advance candidates through the hiring pipeline.
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
          <Grid item xs={12} md={(activeRole === 'ADMIN' || activeRole === 'CEO') ? 6 : 9}>
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
                <MenuItem value="Placed">Onboarded</MenuItem>
                <MenuItem value="Under Review">Under Review</MenuItem>
                <MenuItem value="Interview Scheduled">Interview Scheduled</MenuItem>
                <MenuItem value="Interview Completed">Interview Completed</MenuItem>
                <MenuItem value="Offer Sent">Offer Sent</MenuItem>
                <MenuItem value="Offer Accepted">Offer Accepted</MenuItem>
                <MenuItem value="Selected">Selected</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
                <MenuItem value="On Hold">On Hold</MenuItem>
                <MenuItem value="Closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {(activeRole === 'ADMIN' || activeRole === 'CEO') && (
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

      {/* Main Table view */}
      <Card>
        <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#101726' }}>
                <th style={{ width: '45px', padding: '6px 8px', whiteSpace: 'nowrap' }}></th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant ID</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant Name</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Email</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Code</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>City</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>State</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Applicant Status</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Title</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Job Type</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Client Name</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Tentative Start Date</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Manager</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Team Lead</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Recruiter</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>PAN Card</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Aadhaar</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Alt Mobile</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Source</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Interest to Work</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Modified By</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Pay Rate</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Gross Revenue</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Taxes</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>TDS</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Invoice Amount</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Profit Amount</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>Date of Join</th>
                {showActionColumn && <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {uniqueCandidates.map((cand) => {
                const app = cand.primaryApp;
                const isExpanded = !!expandedCandidates[cand.key];
                return (
                  <React.Fragment key={cand.key}>
                    <tr
                      style={{ borderBottom: isExpanded ? 'none' : `1px solid ${theme.palette.divider}`, transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <Box 
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCandidates(prev => ({ ...prev, [cand.key]: !prev[cand.key] }));
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
                            {cand.allSubmissions.length}
                          </Box>
                        </Box>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{app.id}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                          onClick={() => handleAppSelect(app)}
                        >
                          {renderCellText(app.candidate_name, 120, () => handleAppSelect(app))}
                        </Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.candidate_email, 140)}</Typography>
                      </td>
                      {(() => {
                        const directJobCode = getRemarkField(app.remarks, 'Job Code');
                        // Find a submission that has a real Job Code, or default to direct properties
                        const realSubmission = cand.allSubmissions.find(s => getRemarkField(s.remarks, 'Job Code') !== 'N/A');
                        
                        const displayJobCode = directJobCode !== 'N/A' ? directJobCode : (realSubmission ? getRemarkField(realSubmission.remarks, 'Job Code') : 'N/A');
                        const displayPosition = (app.position && app.position !== 'N/A') ? app.position : (realSubmission ? realSubmission.position : 'N/A');

                        const jobPosting = applications.find(a => !a.candidate_name && getRemarkField(a.remarks, 'Job Code') === displayJobCode);
                        const displayJobType = jobPosting ? getRemarkField(jobPosting.remarks, 'Job Type') : 'N/A';
                        const displayClientName = (app.client_name && app.client_name !== 'N/A') ? app.client_name : (jobPosting ? jobPosting.client_name : (realSubmission ? realSubmission.client_name : 'N/A'));
                        const displayStartDate = jobPosting ? getRemarkField(jobPosting.remarks, 'Start Date') : 'N/A';

                        const siblingApps = applications.filter(a => !a.candidate_name && getRemarkField(a.remarks, 'Job Code') === displayJobCode);
                        const recruiterEmails = siblingApps.map(a => a.assigned_employee?.email).filter(Boolean) as string[];
                        
                        // Fallback to primary recruiter if no assignee exists on the sibling requirements
                        if (recruiterEmails.length === 0 && app.assigned_employee?.email) {
                          recruiterEmails.push(app.assigned_employee.email);
                        }
                        const hierarchyInfo = getHierarchyInfo(recruiterEmails);

                        return (
                          <>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(displayJobCode, 90)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.city, 90)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.state, 90)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography
                                variant="body2"
                                sx={{ 
                                  fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem', 
                                  fontWeight: 700, 
                                  color: 'primary.main', 
                                  cursor: isReadOnly ? 'default' : 'pointer', 
                                  '&:hover': { textDecoration: isReadOnly ? 'none' : 'underline' } 
                                }}
                                onClick={isReadOnly ? undefined : (e) => {
                                  e.stopPropagation();
                                  setStatusUpdateApp(app);
                                  setStatusUpdateValue(app.status as ApplicationStatus);
                                  setStatusUpdateComment('');
                                  setPayRateInput(getRemarkField(app.remarks, 'Pay Rate') !== 'N/A' ? getRemarkField(app.remarks, 'Pay Rate') : '');
                                  setGrossRevenueInput(getRemarkField(app.remarks, 'Gross Revenue') !== 'N/A' ? getRemarkField(app.remarks, 'Gross Revenue') : '');
                                  setTaxesInput(getRemarkField(app.remarks, 'Taxes') !== 'N/A' ? getRemarkField(app.remarks, 'Taxes') : '');
                                  setTdsInput(getRemarkField(app.remarks, 'TDS') !== 'N/A' ? getRemarkField(app.remarks, 'TDS') : '');
                                  setInvoiceAmountInput(getRemarkField(app.remarks, 'Invoice Amount') !== 'N/A' ? getRemarkField(app.remarks, 'Invoice Amount') : '');
                                  setProfitAmountInput(getRemarkField(app.remarks, 'Profit Amount') !== 'N/A' ? getRemarkField(app.remarks, 'Profit Amount') : '');
                                  setDateOfJoinInput(getRemarkField(app.remarks, 'Date of Join') !== 'N/A' ? getRemarkField(app.remarks, 'Date of Join') : '');
                                }}
                              >
                                {app.status}
                              </Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="subtitle2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 750 }}>{renderCellText(displayPosition, 150)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(displayJobType, 110)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(displayClientName, 110)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(displayStartDate, 110)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(hierarchyInfo.manager, 110)}</Typography>
                            </td>
                            <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                              <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(hierarchyInfo.tl, 110)}</Typography>
                            </td>
                          </>
                        );
                      })()}
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.recruiter || app.assigned_employee?.full_name || 'System', 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.pan_card, 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.aadhaar, 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.alternate_mobile_number, 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.source, 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.interest_to_work_for_client, 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.modified_by || 'N/A', 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Pay Rate'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Gross Revenue'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Taxes'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'TDS'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Invoice Amount'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Profit Amount'), 110)}</Typography>
                      </td>
                      <td style={{ padding: activeRole === 'CEO' ? '2px 4px' : '4px 8px', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontSize: activeRole === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkField(app.remarks, 'Date of Join'), 110)}</Typography>
                      </td>
                      {showActionColumn && (
                        <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/candidates/create/${app.id}`);
                              }}
                            >
                              Edit
                            </Typography>
                            {!shouldHideAction && (
                              <Typography
                                variant="body2"
                                sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'error.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete this applicant submission?`)) {
                                    try {
                                      await api.delete(`applications/${app.id}/`);
                                      dispatch(deleteApplication(String(app.id)));
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
                    {isExpanded && (
                      <tr style={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                        <td colSpan={shouldHideAction ? 16 : 17} style={{ padding: '16px 24px' }}>
                          <Box sx={{ mb: 2 }}>
                            <Button
                              variant="contained"
                              size="small"
                              sx={{ borderRadius: '20px', textTransform: 'none', px: 2, fontWeight: 700, pointerEvents: 'none', height: 26, fontSize: '0.7rem' }}
                            >
                              Submissions ({cand.allSubmissions.length})
                            </Button>
                          </Box>
                          <Table size="small" sx={{ bgcolor: 'background.paper', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.palette.divider}` }}>
                            <TableHead>
                              <TableRow sx={{ bgcolor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                                <TableCell sx={{ fontWeight: 800, fontSize: '0.72rem', color: theme.palette.text.secondary }}>Job Code</TableCell>
                                <TableCell sx={{ fontWeight: 800, fontSize: '0.72rem', color: theme.palette.text.secondary }}>Job Title</TableCell>
                                <TableCell sx={{ fontWeight: 800, fontSize: '0.72rem', color: theme.palette.text.secondary }}>Manager</TableCell>
                                <TableCell sx={{ fontWeight: 800, fontSize: '0.72rem', color: theme.palette.text.secondary }}>Profile Status</TableCell>
                                <TableCell sx={{ fontWeight: 800, fontSize: '0.72rem', color: theme.palette.text.secondary }}>Client</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {cand.allSubmissions.map((sub) => (
                                <TableRow key={sub.id}>
                                  <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{getRemarkField(sub.remarks, 'Job Code')}</TableCell>
                                  <TableCell sx={{ fontSize: '0.7rem', py: 1, fontWeight: 700 }}>{sub.position}</TableCell>
                                  <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{sub.recruiter || sub.assigned_employee?.full_name || 'System'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.7rem', py: 1, fontWeight: 750, color: 'primary.main' }}>{sub.status}</TableCell>
                                  <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{sub.client_name}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {displayApps.length === 0 && (
                <tr>
                  <td colSpan={shouldHideAction ? 10 : 11} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    No applications match the active filters or search terms.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Card>

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

      {/* STATUS UPDATE DIALOG */}
      <Dialog
        open={statusUpdateApp !== null}
        onClose={() => setStatusUpdateApp(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: { borderRadius: '16px', p: 1 }
        }}
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
            sx={{ fontWeight: 700, bgcolor: 'primary.50' }}
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
                  <MenuItem value="Offer Sent">Offer Sent</MenuItem>
                  <MenuItem value="Offer Accepted">Offer Accepted</MenuItem>
                  <MenuItem value="Selected">Selected</MenuItem>
                  <MenuItem value="Rejected">Rejected</MenuItem>
                  <MenuItem value="On Hold">On Hold</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                </Select>
              </FormControl>

              {statusUpdateValue === 'Offer Sent' && (
                <Box sx={{ mb: 3, p: 2, border: `1px solid ${theme.palette.divider}`, borderRadius: '8px', bgcolor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
                    FINANCIAL DETAILS (REQUIRED FOR OFFER SENT)
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Pay Rate *"
                        placeholder="e.g. $50/hr or 10 LPA"
                        value={payRateInput}
                        onChange={(e) => setPayRateInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Gross Revenue *"
                        placeholder="e.g. $70/hr"
                        value={grossRevenueInput}
                        onChange={(e) => setGrossRevenueInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Taxes *"
                        placeholder="e.g. $5/hr"
                        value={taxesInput}
                        onChange={(e) => setTaxesInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="TDS *"
                        placeholder="e.g. 10%"
                        value={tdsInput}
                        onChange={(e) => setTdsInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Invoice Amount *"
                        placeholder="e.g. $10,000"
                        value={invoiceAmountInput}
                        onChange={(e) => setInvoiceAmountInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Profit Amount *"
                        placeholder="e.g. $15/hr"
                        value={profitAmountInput}
                        onChange={(e) => setProfitAmountInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Date of Join (Optional)"
                        InputLabelProps={{ shrink: true }}
                        value={dateOfJoinInput}
                        onChange={(e) => setDateOfJoinInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}

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
            disabled={
              statusUpdateValue === 'Offer Sent' &&
              (!payRateInput.trim() ||
                !grossRevenueInput.trim() ||
                !taxesInput.trim() ||
                !tdsInput.trim() ||
                !invoiceAmountInput.trim() ||
                !profitAmountInput.trim())
            }
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

