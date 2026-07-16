import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Card,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Search } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../redux/store';
import { setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';
import { getUniqueSubmissions } from './dashboards/PipelineKPIs';

export const Placements: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { applications } = useAppSelector(state => state.applications);
  const { users } = useAppSelector(state => state.users);
  const { user: currentUser } = useAppSelector(state => state.auth);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('ALL');
  const [loading, setLoading] = useState(false);

  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  const todayStr = (): string => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const teamsList = useMemo(() => {
    const unique = new Map();
    users.flatMap(u => u.teams || []).filter(t => t && t.id).forEach(t => {
      unique.set(String(t.id), t);
    });
    return Array.from(unique.values());
  }, [users]);

  // Load applications from API (Reuses Redux cache if available to prevent slow load times)
  useEffect(() => {
    const hasData = applications && applications.length > 0;
    if (hasData) {
      setLoading(false);
    } else {
      setLoading(true);
    }
    api.get('applications/')
      .then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [dispatch]);

  // Helper to extract fields from remarks
  const getRemarkField = (remarks: string, fieldName: string): string => {
    if (!remarks) return 'N/A';
    // Use ^ anchor with multiline and case-insensitive flags so we match the field regardless of case
    const regex = new RegExp(`^${fieldName}:\\s*(.+)`, 'mi');
    const match = remarks.match(regex);
    if (!match) return 'N/A';
    return match[1].trim() || 'N/A';
  };

  // Helper to extract numeric profit based on rates
  const getProfitAmount = (remarks: string) => {
    const grossStr = getRemarkField(remarks, 'Client Bill Rate');
    const invStr = getRemarkField(remarks, 'Pay Rate');
    const extractNumber = (s: string) => {
      const cleaned = s.replace(/[^0-9]/g, '');
      return cleaned ? parseFloat(cleaned) : NaN;
    };
    const grossNum = extractNumber(grossStr);
    const invNum = extractNumber(invStr);
    if (!isNaN(grossNum) && !isNaN(invNum)) {
      const diff = grossNum - invNum;
      const currency = grossStr.includes('LPA') ? ' LPA' : (grossStr.includes('$') ? '$' : '');
      if (currency === ' LPA') {
        return `${diff}${currency}`;
      } else if (currency === '$') {
        return `$${diff}`;
      }
      return `${diff}`;
    }
    return 'N/A';
  };

  const renderCellText = (text: string | null | undefined, maxWidth: number = 130) => {
    if (!text) return '—';
    if (text.length > maxWidth / 7) {
      return (
        <Box
          component="span"
          title={text}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            alert(text);
          }}
          sx={{
            cursor: 'pointer',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            maxWidth: maxWidth,
            verticalAlign: 'middle'
          }}
        >
          {text}
        </Box>
      );
    }
    return text;
  };

  // Auto-generate Placement Codes in ascending order (sorted by created_at & ID)
  const placedCandidates = useMemo(() => {
    const uniqueApps = getUniqueSubmissions(applications);
    const placed = uniqueApps.filter(app => {
      if (app.status !== 'Placed' || getRemarkField(app.remarks || '', 'Job Code') === 'N/A') return false;

      // 0. Date and Team Filter (only for ADMIN/CEO)
      if (activeRole === 'ADMIN' || activeRole === 'CEO') {
        const savedStart = localStorage.getItem('dashboard_start_date') || todayStr();
        const savedEnd = localStorage.getItem('dashboard_end_date') || todayStr();
        const appDate = (app.updated_at || app.created_at || '').slice(0, 10);
        if (appDate < savedStart || appDate > savedEnd) return false;

        if (selectedTeamId !== 'ALL') {
          const assignedEmail = app.assigned_employee?.email?.toLowerCase();
          if (!assignedEmail) return false;
          const recruiterUser = users.find(u => u.email.toLowerCase() === assignedEmail);
          const isMemberOfTeam = recruiterUser?.teams?.some(t => String(t.id) === selectedTeamId);
          if (!isMemberOfTeam) return false;
        }
      }
      return true;
    });

    // Sort by created_at ascending
    const sorted = [...placed].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

    // Map each to include auto-generated placement code
    return sorted.map((app, idx) => {
      const plcNumber = String(idx + 1).padStart(4, '0');
      const placementCode = `PLC-${plcNumber}`;
      return {
        ...app,
        placementCode
      };
    });
  }, [applications, selectedTeamId, users, activeRole]);

  // Filter based on search term
  const filteredCandidates = useMemo(() => {
    return placedCandidates.filter(app => {
      const searchLower = searchTerm.toLowerCase();
      const name = (app.candidate_name || '').toLowerCase();
      const email = (app.candidate_email || '').toLowerCase();
      const pos = (app.position || '').toLowerCase();
      const client = (app.client_name || '').toLowerCase();
      const tech = (app.technology || '').toLowerCase();
      const plcCode = app.placementCode.toLowerCase();
      const jobCode = getRemarkField(app.remarks, 'Job Code').toLowerCase();

      return (
        name.includes(searchLower) ||
        email.includes(searchLower) ||
        pos.includes(searchLower) ||
        client.includes(searchLower) ||
        tech.includes(searchLower) ||
        plcCode.includes(searchLower) ||
        jobCode.includes(searchLower)
      );
    });
  }, [placedCandidates, searchTerm]);

  return (
    <Box sx={{ pb: 5 }}>
      {/* Header section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Placements Registry
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            List of all successfully placed candidates and assignment details
          </Typography>
        </Box>
      </Box>



      {/* Filter and Search controls */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, mb: 4, p: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={(activeRole === 'ADMIN' || activeRole === 'CEO') ? 9 : 12}>
            <TextField
              placeholder="Search by candidate name, client, position, technology, placement code, or job code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="small"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} style={{ color: theme.palette.text.secondary }} />
                  </InputAdornment>
                ),
                style: { borderRadius: '8px' }
              }}
            />
          </Grid>
          {(activeRole === 'ADMIN' || activeRole === 'CEO') && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Team</InputLabel>
                <Select
                  value={selectedTeamId}
                  label="Filter by Team"
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  sx={{ borderRadius: '8px' }}
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

      {/* Main Placements Table */}
      <TableContainer
        component={Paper}
        sx={{
          borderRadius: '12px',
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: 'none',
          bgcolor: theme.palette.mode === 'light' ? '#fff' : '#0f172a',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Table
            sx={{
              minWidth: 2000,
              '& .MuiTableCell-root': {
                padding: '4px 8px',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap'
              },
              '& .MuiTableCell-head': {
                padding: '6px 8px',
                fontSize: '0.7rem',
                whiteSpace: 'nowrap'
              },
              '& .MuiTypography-root': {
                fontSize: '0.75rem'
              },
              '& .MuiTypography-caption': {
                fontSize: '0.65rem'
              }
            }}
            size="small"
          >
            <TableHead>
              <TableRow
                style={{
                  borderBottom: `2px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#1e293b'
                }}
              >
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Placement Code</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Applicant Name</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Job Code</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Job Title</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Client</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Business Unit</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Gross Revenue</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Invoice Amount</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Profit Amount</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Created By</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Created On</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Tentative Start Date</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Actual Start Date</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Actual End Date</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Placement Status</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Recruiter</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Manager</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>City/State</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={18} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Loading placements data...
                  </TableCell>
                </TableRow>
              ) : filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={18} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No placed candidates found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCandidates.map((app) => (
                  <TableRow
                    key={app.id}
                    sx={{
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      whiteSpace: 'nowrap',
                      '&:hover': {
                        bgcolor: theme.palette.mode === 'light' ? '#f8fafc' : '#1e293b50'
                      }
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.placementCode, 100)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.candidate_name, 120)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Job Code'), 90)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.position, 140)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.client_name, 120)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Business Unit'), 120)}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Client Bill Rate'), 100)}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Pay Rate'), 100)}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {renderCellText(getProfitAmount(app.remarks), 100)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.recruiter || app.assigned_employee?.full_name || 'System', 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(app.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Start Date'), 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Actual Start Date') !== 'N/A'
                        ? getRemarkField(app.remarks, 'Actual Start Date')
                        : getRemarkField(app.remarks, 'Start Date'), 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'End Date'), 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.status, 90)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.recruiter || app.assigned_employee?.full_name || 'System', 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(getRemarkField(app.remarks, 'Manager'), 110)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {renderCellText(app.city && app.state ? `${app.city}, ${app.state}` : app.city || app.state || 'N/A', 120)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      </TableContainer>
    </Box>
  );
};
