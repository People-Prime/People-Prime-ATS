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
import { changeApplicationStatus, addApplicationNote, setApplications, deleteApplication } from '../redux/applicationsSlice';
import { Application, ApplicationStatus } from '../types';
import { api } from '../services/api';

export const Applications: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const location = useLocation();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications } = useAppSelector(state => state.applications);

  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});

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

  // Deletion confirmation state
  const [deleteAppConfirm, setDeleteAppConfirm] = useState<Application | null>(null);

  // Status update modal state
  const [statusUpdateApp, setStatusUpdateApp] = useState<Application | null>(null);
  const [statusUpdateValue, setStatusUpdateValue] = useState<ApplicationStatus>('New');
  const [statusUpdateComment, setStatusUpdateComment] = useState('');


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

  // Load applications from API
  useEffect(() => {
    setLoading(true);
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

  // Filter applications based on search and selected filter and roles
  const filteredApps = applications.filter((app) => {
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
      const matchClient = app.client_name.toLowerCase().includes(term);
      const matchPosition = app.position.toLowerCase().includes(term);
      const matchTech = app.technology.toLowerCase().includes(term);
      return matchCandidate || matchClient || matchPosition || matchTech;
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
      const sorted = [...apps].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      
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
        primaryApp: sorted[0],
        allSubmissions: uniqueSubmissions
      };
    });
  }, [candidateGroups]);

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

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['ID', 'Candidate Name', 'Candidate Email', 'Candidate Phone', 'Client Name', 'Position', 'Technology', 'Experience', 'Assigned Analyst', 'Status', 'Updated At'];
    const rows = displayApps.map(app => [
      app.id,
      app.candidate_name || 'N/A',
      app.candidate_email || 'N/A',
      app.candidate_phone || 'N/A',
      app.client_name,
      app.position,
      app.technology,
      app.experience,
      app.assigned_employee?.full_name || 'Unassigned',
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
          <Grid item xs={12} md={6}>
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
                <MenuItem value="Submitted">Placed</MenuItem>
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

        </Grid>
      </Card>

      {/* Main Table view */}
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#101726' }}>
                <th style={{ width: '45px', padding: '6px 8px' }}></th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Applicant ID</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Applicant Name</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Email</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Job Code</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>City</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>State</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Applicant Status</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Job Title</th>
                <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary }}>Created By</th>
                {!isReadOnly && <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'center' }}>Actions</th>}
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
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{app.id}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                          onClick={() => handleAppSelect(app)}
                        >
                          {app.candidate_name || 'N/A'}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{app.candidate_email || 'N/A'}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{getRemarkField(app.remarks, 'Job Code')}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{app.city || 'N/A'}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{app.state || 'N/A'}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography
                          variant="body2"
                          sx={{ 
                            fontSize: '0.75rem', 
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
                          }}
                        >
                          {app.status}
                        </Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="subtitle2" sx={{ fontSize: '0.75rem', fontWeight: 750 }}>{app.position}</Typography>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{app.recruiter || app.assigned_employee?.full_name || 'System'}</Typography>
                      </td>
                      {!isReadOnly && (
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
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
                          </Box>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr style={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                        <td colSpan={11} style={{ padding: '16px 24px' }}>
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
                  <td colSpan={11} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
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

