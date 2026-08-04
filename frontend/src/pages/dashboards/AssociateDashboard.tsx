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
import { useAppSelector, useAppDispatch } from '../../redux/store';
import { setApplications } from '../../redux/applicationsSlice';
import { api } from '../../services/api';
import { getUniqueSubmissions } from './PipelineKPIs';
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

export const AssociateDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications } = useAppSelector(state => state.applications);

  const deduplicatedApps = getUniqueSubmissions(applications);

  const myApplications = deduplicatedApps.filter(app => {
    const assignedEmail = app.assigned_employee?.email?.toLowerCase();
    const recruiterStr = app.recruiter?.toLowerCase() || '';
    const myEmail = currentUser?.email?.toLowerCase() || '';
    const myName = currentUser?.full_name?.toLowerCase() || '';

    return (assignedEmail && assignedEmail === myEmail) ||
      (recruiterStr && (recruiterStr === myEmail || recruiterStr === myName));
  });


  const [startDate, setStartDate] = useState(() => localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr());
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null);

  React.useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`dashboard_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`dashboard_end_date_${currentUser.email}`, endDate);
    }
  }, [startDate, endDate, currentUser]);

  React.useEffect(() => {
    if (applications.length === 0) {
      api.get('applications/?all_applicants=true').then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => {});
    }
  }, [applications.length, dispatch]);

  const getJobCandidates = (selectedApp: any) => {
    const jobCode = getRemarkField(selectedApp.remarks, 'Job Code');
    const matches = applications.filter(app => {
      if (!app.candidate_name) return false;
      const appJobCode = getRemarkField(app.remarks, 'Job Code');
      if (appJobCode && appJobCode !== 'N/A') {
        return jobCode && jobCode !== 'N/A' && appJobCode.toUpperCase().trim() === jobCode.toUpperCase().trim();
      }
      return (
        app.position?.toLowerCase().trim() === selectedApp.position?.toLowerCase().trim() &&
        app.client_name?.toLowerCase().trim() === selectedApp.client_name?.toLowerCase().trim()
      );
    });
    const seen = new Set<string>();
    return matches.filter(app => {
      const email = app.candidate_email?.toLowerCase() || app.candidate_name?.toLowerCase() || '';
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  };

  // Filter by date range when range is selected (includes jobs created/assigned or having candidate submissions within selected date range)
  const dateFilteredApps = (startDate && endDate)
    ? myApplications.filter(app => {
      const d = ((app.updated_at || app.created_at) || '').slice(0, 10);
      const isWithinDate = d >= startDate && d <= endDate;
      if (isWithinDate) return true;
      if (!app.candidate_name) {
        const jobCode = getRemarkField(app.remarks, 'Job Code');
        const hasSubmissionsInDate = myApplications.some(sub => {
          if (!sub.candidate_name) return false;
          const subDate = ((sub.updated_at || sub.created_at) || '').slice(0, 10);
          if (subDate < startDate || subDate > endDate) return false;
          const subCode = getRemarkField(sub.remarks, 'Job Code');
          if (jobCode && jobCode !== 'N/A' && subCode && subCode !== 'N/A') {
            return subCode.toUpperCase().trim() === jobCode.toUpperCase().trim();
          }
          return (
            sub.position?.toLowerCase().trim() === app.position?.toLowerCase().trim() &&
            sub.client_name?.toLowerCase().trim() === app.client_name?.toLowerCase().trim()
          );
        });
        if (hasSubmissionsInDate) return true;
      }
      return false;
    })
    : myApplications;


  const findParentJob = (app: any): any => {
    if (!app) return null;
    if (!app.candidate_name) return app;
    const directCode = getRemarkField(app.remarks, 'Job Code');
    if (directCode && directCode !== 'N/A') {
      const parentByCode = applications.find(a =>
        !a.candidate_name &&
        getRemarkField(a.remarks, 'Job Code').toUpperCase().trim() === directCode.toUpperCase().trim()
      );
      if (parentByCode) return parentByCode;
    }
    const normPos = app.position?.toLowerCase().trim();
    const normClient = app.client_name?.toLowerCase().trim();
    if (!normPos || !normClient) return null;
    return applications.find(a =>
      !a.candidate_name &&
      a.position?.toLowerCase().trim() === normPos &&
      a.client_name?.toLowerCase().trim() === normClient
    ) || null;
  };

  const uniqueJobOpenings = React.useMemo(() => {
    const seen = new Set<string>();
    const unique: typeof dateFilteredApps = [];
    dateFilteredApps.forEach(app => {
      const parentJob = findParentJob(app) || app;
      const jobCode = getRemarkField(parentJob.remarks, 'Job Code');
      const key = (jobCode && jobCode !== 'N/A') 
        ? jobCode.toUpperCase().trim() 
        : `${parentJob.client_name?.toLowerCase().trim()}|${parentJob.position?.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        const rep = { ...(parentJob || app) };
        unique.push(rep);
      }
    });
    return unique;
  }, [dateFilteredApps, applications]);

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

      {/* Hierarchy Report Section */}
      <Box sx={{ mt: 4 }}>
        <HierarchyReport
          rootEmail={currentUser?.email}
          startDate={startDate}
          endDate={endDate}
        />
      </Box>
    </Box>
  );
};
