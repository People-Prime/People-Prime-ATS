import React, { useState, useEffect, useMemo } from 'react';
import { formatDateDDMMYYYY } from '../utils/formatters';
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
  MenuItem,
  Button,
  TablePagination
} from '@mui/material';
import { Search, Download } from 'lucide-react';
import { useAppSelector } from '../redux/store';
import { api } from '../services/api';
import { DashboardCalendar, todayStr } from './dashboards/DashboardCalendar';
import { getUniqueSubmissions, getStatusTransitionDate } from './dashboards/PipelineKPIs';

export const Placements: React.FC = () => {
  const theme = useTheme();
  const { users } = useAppSelector(state => state.users);
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { notes } = useAppSelector(state => state.applications);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => localStorage.getItem(`placements_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`placements_end_date_${currentUser?.email}`) || todayStr());

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [localApplications, setLocalApplications] = useState<any[]>([]);

  // Reset page when search or date filters change
  useEffect(() => {
    setPage(0);
  }, [searchTerm, startDate, endDate]);

  useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`placements_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`placements_end_date_${currentUser.email}`, endDate);
    }
  }, [startDate, endDate, currentUser]);

  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  const teamsList = useMemo(() => {
    const unique = new Map();
    users.flatMap(u => u.teams || []).filter(t => t && t.id).forEach(t => {
      unique.set(String(t.id), t);
    });
    return Array.from(unique.values());
  }, [users]);

  useEffect(() => {
    setLoading(true);
    let url = `applications/?status=Placed&`;
    if (searchTerm.trim()) {
      url += `global_search=${encodeURIComponent(searchTerm.trim())}&`;
    }
    api.get(url)
      .then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        setLocalApplications(list);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [searchTerm]);

  // Helper to extract fields from remarks
  const getRemarkField = (remarks: string, fieldName: string): string => {
    if (!remarks) return 'N/A';
    if (fieldName === 'Variable Pay') {
      const matchVar = remarks.match(/^(Variable Pay|Gross Revenue):\s*(.+)/mi);
      return matchVar ? (matchVar[2].trim() || 'N/A') : 'N/A';
    }
    if (fieldName === 'Offer Value') {
      const matchOffer = remarks.match(/^(Offer Value|Invoice Amount):\s*(.+)/mi);
      return matchOffer ? (matchOffer[2].trim() || 'N/A') : 'N/A';
    }
    // Use ^ anchor with multiline and case-insensitive flags so we match the field regardless of case
    const regex = new RegExp(`^${fieldName}:\\s*(.+)`, 'mi');
    const match = remarks.match(regex);
    if (!match) return 'N/A';
    return match[1].trim() || 'N/A';
  };

  // Helper to extract numeric profit based on rates
  const getProfitAmount = (remarks: string) => {
    const directProfit = getRemarkField(remarks, 'Profit Amount');
    if (directProfit && directProfit !== 'N/A') return directProfit;
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

  const uniqueLocalPlaced = useMemo(() => {
    const candidatesOnly = localApplications.filter((app: any) => app.candidate_name && app.candidate_name.trim() !== '');
    return getUniqueSubmissions(candidatesOnly);
  }, [localApplications]);

  const placedCandidates = useMemo(() => {
    const sorted = [...uniqueLocalPlaced].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });
    return sorted.map((app, idx) => {
      const plcNumber = String(idx + 1).padStart(4, '0');
      const placementCode = `PLC-${plcNumber}`;
      return { ...app, placementCode };
    });
  }, [uniqueLocalPlaced]);

  const filteredCandidates = useMemo(() => {
    return placedCandidates.filter(app => {
      if (!searchTerm.trim()) {
        const d = getStatusTransitionDate(app, 'Placed', notes);
        const isWithinDate = !!d && d >= startDate && d <= endDate;
        const isSystem = !app.modified_by || app.modified_by.toLowerCase() === 'system';
        if (!isWithinDate || isSystem) return false;
      }
      return true;
    });
  }, [placedCandidates, startDate, endDate, searchTerm, notes]);

  const paginatedCandidates = useMemo(() => {
    return filteredCandidates.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [filteredCandidates, page, rowsPerPage]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DashboardCalendar
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            onClick={() => {
              const headers = [
                'Placement Code',
                'Applicant Name',
                'Client',
                'Recruiter',
                'Count',
                'Modified By',
                'Team Lead',
                'Created By',
                'Manager',
                'Placement Type',
                'Pay Rate',
                'Variable Pay',
                'Offer Value',
                'Profit Amount',
                'Date of Join',
                'Created Date',
                'Status Changed Date'
              ];

              const rows = filteredCandidates.map(app => {
                const hierarchyInfo = getHierarchyInfo([app.assigned_employee?.email].filter(Boolean));
                const placementType = getRemarkField(app.remarks, 'Employee Type');
                return [
                  app.placementCode || 'N/A',
                  app.candidate_name || 'N/A',
                  app.client_name || 'N/A',
                  app.recruiter || 'N/A',
                  '1',
                  app.modified_by || 'System',
                  hierarchyInfo.tl,
                  app.assigned_employee?.full_name || 'System',
                  hierarchyInfo.manager,
                  placementType,
                  getRemarkField(app.remarks, 'Pay Rate'),
                  getRemarkField(app.remarks, 'Variable Pay'),
                  getRemarkField(app.remarks, 'Offer Value'),
                  getProfitAmount(app.remarks) || 'N/A',
                  formatDateDDMMYYYY(getRemarkField(app.remarks, 'Date of Join')),
                  formatDateDDMMYYYY(app.created_at),
                  formatDateDDMMYYYY(app.transition_dates?.Placed || app.updated_at)
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
              link.setAttribute('download', `placements_export_${Date.now()}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
            sx={{ borderRadius: '8px', borderWeight: 2 }}
          >
            Export CSV Registry
          </Button>
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
        <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px' }}>
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
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Client</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Recruiter</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Count</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Modified By</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Team Lead</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Created By</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Manager</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Placement Type</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Pay Rate</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Variable Pay</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Offer Value</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary, textAlign: 'right' }}>Profit Amount</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Date of Join</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Created Date</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', color: theme.palette.text.secondary }}>Status Changed Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={17} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Loading placements data...
                  </TableCell>
                </TableRow>
              ) : filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No placed candidates found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCandidates.map((app) => {
                  const hierarchyInfo = getHierarchyInfo([app.assigned_employee?.email].filter(Boolean));
                  const placementType = getRemarkField(app.remarks, 'Employee Type');
                  return (
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
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.placementCode, 100)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.candidate_name, 120)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.client_name, 120)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.recruiter || 'N/A', 110)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>1</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.modified_by || 'System', 110)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(hierarchyInfo.tl, 110)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(app.assigned_employee?.full_name || 'System', 110)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(hierarchyInfo.manager, 110)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(placementType, 100)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{renderCellText(getRemarkField(app.remarks, 'Pay Rate'), 100)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{renderCellText(getRemarkField(app.remarks, 'Variable Pay'), 100)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{renderCellText(getRemarkField(app.remarks, 'Offer Value'), 100)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{renderCellText(getProfitAmount(app.remarks), 100)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{renderCellText(formatDateDDMMYYYY(getRemarkField(app.remarks, 'Date of Join')), 110)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(app.created_at)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(app.transition_dates?.Placed || app.updated_at)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[25, 50, 100]}
        component="div"
        count={filteredCandidates.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />
    </Box>
  );
};
