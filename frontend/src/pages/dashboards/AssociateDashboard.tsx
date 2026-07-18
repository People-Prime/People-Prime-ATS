import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Card,
  Button,
  useTheme
} from '@mui/material';
import {
  Building,
  Wrench,
  Plus
} from 'lucide-react';
import { useAppSelector } from '../../redux/store';
import { getUniqueSubmissions } from './PipelineKPIs';
import { DashboardCalendar, todayStr } from './DashboardCalendar';

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

export const AssociateDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications } = useAppSelector(state => state.applications);

  const deduplicatedApps = getUniqueSubmissions(applications);

  const myApplications = deduplicatedApps.filter(app =>
    app.assigned_employee?.email === currentUser?.email &&
    getRemarkField(app.remarks, 'Job Code') !== 'N/A'
  );


  const [startDate, setStartDate] = useState(() => localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr());
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null);

  React.useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`dashboard_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`dashboard_end_date_${currentUser.email}`, endDate);
    }
  }, [startDate, endDate, currentUser]);

  const getJobCandidates = (selectedApp: any) => {
    const matches = deduplicatedApps.filter(app =>
      app.candidate_name &&
      app.position?.toLowerCase() === selectedApp.position?.toLowerCase() &&
      app.client_name?.toLowerCase() === selectedApp.client_name?.toLowerCase() &&
      app.technology?.toLowerCase() === selectedApp.technology?.toLowerCase()
    );
    const seen = new Set<string>();
    return matches.filter(app => {
      const email = app.candidate_email?.toLowerCase() || '';
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  };

  // Filter by date range when range is selected
  const dateFilteredApps = (startDate && endDate)
    ? myApplications.filter(app => {
      const d = (app.updated_at || app.created_at || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    })
    : myApplications;


  const uniqueJobOpenings = React.useMemo(() => {
    const seen = new Set<string>();
    const unique: typeof dateFilteredApps = [];
    dateFilteredApps.forEach(app => {
      const key = `${app.client_name?.toLowerCase()}|${app.position?.toLowerCase()}|${app.technology?.toLowerCase()}|${app.experience}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Find the record with candidate_name if it exists, otherwise use this one
        const matches = dateFilteredApps.filter(m =>
          m.client_name?.toLowerCase() === app.client_name?.toLowerCase() &&
          m.position?.toLowerCase() === app.position?.toLowerCase() &&
          m.technology?.toLowerCase() === app.technology?.toLowerCase() &&
          Number(m.experience) === Number(app.experience)
        );
        const withCandidate = matches.find(m => m.candidate_name);
        unique.push(withCandidate || app);
      }
    });
    return unique;
  }, [dateFilteredApps]);

  // Status Chip helper
  const getStatusChip = (status: string) => {
    return (
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
        {status}
      </Typography>
    );
  };

  return (
    <Box>
      {/* Header section with Greeting on Left and Calendar controls on Right */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: -0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is your candidate sourcing and job assignment status today.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>

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



      {/* Assigned Job Requirement Openings for the analyst */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={750}>
                  My Assigned Job Openings & Candidate Sourcing
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  These requirements are assigned to you by your Team Lead. Select a requirement to add a candidate, submit details, or check active candidates.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={18} />}
                  sx={{ borderRadius: '8px', fontWeight: 700 }}
                  onClick={() => {
                    navigate('/candidates/create');
                  }}
                >
                  Add Candidate
                </Button>
              </Box>
            </Box>

            <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.secondary }}>Client</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.secondary }}>Position</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.secondary }}>Requirements</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.secondary }}>Status</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.secondary, textAlign: 'center' }}>Candidates</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueJobOpenings.map((app) => (
                    <React.Fragment key={app.id}>
                      <tr style={{ borderBottom: expandedRow === app.id ? 'none' : `1px solid ${theme.palette.divider}` }}>
                        <td style={{ padding: '4px 8px' }}>
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.75rem' }}>
                            <Building size={12} /> {app.client_name}
                          </Typography>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.75rem' }}>{app.position}</Typography>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                            <Wrench size={10} /> {app.technology}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Experience: {app.experience} years</Typography>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          {getStatusChip(app.status)}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <Button
                            variant={expandedRow === app.id ? "contained" : "outlined"}
                            size="small"
                            sx={{ borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, py: 0.25 }}
                            onClick={() => setExpandedRow(expandedRow === app.id ? null : app.id)}
                          >
                            {expandedRow === app.id ? 'Hide Candidates' : 'View Candidates'}
                          </Button>
                        </td>
                      </tr>
                      {expandedRow === app.id && (
                        <tr style={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a', borderBottom: `1px solid ${theme.palette.divider}` }}>
                          <td colSpan={5} style={{ padding: '8px 12px' }}>
                            <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: '8px', overflow: 'hidden', bgcolor: 'background.paper' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ borderBottom: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b' }}>
                                    <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, color: theme.palette.text.secondary }}>Candidate Name</th>
                                    <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, color: theme.palette.text.secondary }}>Contact Info</th>
                                    <th style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, color: theme.palette.text.secondary }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {getJobCandidates(app).map(candidate => (
                                    <tr key={candidate.id} style={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                                      <td style={{ padding: '4px 8px' }}>
                                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>{candidate.candidate_name}</Typography>
                                      </td>
                                      <td style={{ padding: '4px 8px' }}>
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{candidate.candidate_email}</Typography>
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{candidate.candidate_phone}</Typography>
                                      </td>
                                      <td style={{ padding: '4px 8px' }}>
                                        <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                          {candidate.status}
                                        </Typography>
                                      </td>
                                    </tr>
                                  ))}
                                  {getJobCandidates(app).length === 0 && (
                                    <tr>
                                      <td colSpan={3} style={{ padding: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                                        No candidates uploaded for this position yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </Box>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {myApplications.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                        No active job requirements assigned to you.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
