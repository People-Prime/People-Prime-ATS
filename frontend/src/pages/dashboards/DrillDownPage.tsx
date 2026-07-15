import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { ArrowLeft, Building } from 'lucide-react';
import { useAppSelector } from '../../redux/store';

export const DrillDownPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();

  const {
    modalTitle = '',
    modalData = [],
    isJobsType = false,
    isApplicantsType = false,
    isHierarchyType = false
  } = (location.state as any) || {};

  const { user: currentUser } = useAppSelector((state: any) => state.auth);
  const { users } = useAppSelector((state: any) => state.users || { users: [] });
  const { applications = [] } = useAppSelector((state: any) => state.applications || {});

  const [clickedTextValue, setClickedTextValue] = useState<string | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});

  const isCEOOroughReportingTeam = currentUser?.role === 'CEO' || currentUser?.role === 'REPORTING_TEAM';
  const showFullJobsLayout = isCEOOroughReportingTeam || ['TEAM_LEAD', 'SUB_LEAD', 'ASSOCIATE_ANALYST', 'SENIOR_ANALYST'].includes(currentUser?.role);
  const shouldHideAction = ['ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'REPORTING_TEAM', 'CEO'].includes(currentUser?.role);
  const isClientInterviewsForCEO = currentUser?.role === 'CEO' && (modalTitle || '').toLowerCase().includes('interview');

  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
  };

  const renderCellText = (text: string | null | undefined, maxWidth: number = 130) => {
    const val = text || 'N/A';
    if (isCEOOroughReportingTeam) {
      return (
        <Box
          onClick={(e) => {
            e.stopPropagation();
            setClickedTextValue(val);
          }}
          sx={{
            maxWidth: maxWidth,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            fontSize: '0.7rem',
            userSelect: 'none',
            '&:hover': {
              color: 'primary.main',
              textDecoration: 'underline'
            }
          }}
          title="Click to view full text"
        >
          {val}
        </Box>
      );
    }
    return val;
  };


  const getHierarchyInfo = (recruiterEmails: string[]) => {
    const tls = new Set<string>();
    const managers = new Set<string>();

    recruiterEmails.forEach(email => {
      const u = users.find((x: any) => x.email?.toLowerCase() === email.toLowerCase());
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
      tl: Array.from(tls).join(', ') || '—',
      manager: Array.from(managers).join(', ') || '—'
    };
  };

  const getSalaryInfo = (remarks: string) => {
    const payRateStr = getRemarkFieldVal(remarks, 'Pay Rate');
    const salaryStr = getRemarkFieldVal(remarks, 'Salary');
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

  // Grouping for Applicants table style
  const uniqueCandidates = React.useMemo(() => {
    if (!isApplicantsType) return [];

    const candidateGroups: Record<string, any[]> = {};
    modalData.forEach((app: any) => {
      if (!app.candidate_name) return;
      const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
      if (!candidateGroups[key]) {
        candidateGroups[key] = [];
      }
      candidateGroups[key].push(app);
    });

    const unique: any[] = [];
    modalData.forEach((app: any) => {
      if (!app.candidate_name) return;
      const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
      if (!candidateGroups[key]) return;
      const group = candidateGroups[key];
      if (app.id === group[0].id) {
        unique.push({
          key,
          primaryApp: app,
          allSubmissions: group
        });
      }
    });
    return unique;
  }, [modalData, isApplicantsType]);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => navigate(-1)}
          startIcon={<ArrowLeft size={16} />}
          sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 700 }}
        >
          Back to Dashboard
        </Button>
        <Typography variant="h5" fontWeight={800}>
          {isJobsType ? `Job Postings (${modalData.length})` : isApplicantsType ? `Applicants (${uniqueCandidates.length})` : `${modalTitle} (${modalData.length})`}
        </Typography>
      </Box>

      <Card sx={{ borderRadius: '12px', border: `1px solid ${theme.palette.divider}` }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                {isJobsType ? (
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Job Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Client</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Job Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Client Bill Rate / Salary</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Pay Rate / Salary</TableCell>
                    {showFullJobsLayout && (
                      <>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Manager</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>TL</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Recruiter</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Job Created</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Min Sal</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Max Sal</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px' }}>Avg Sal</TableCell>
                      </>
                    )}
                    {!shouldHideAction && (
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: isCEOOroughReportingTeam ? '2px 4px' : '6px 8px', textAlign: 'center' }}>Action</TableCell>
                    )}
                  </TableRow>
                ) : isApplicantsType ? (
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ width: '45px', padding: '6px 8px' }}></TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Applicant ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Applicant Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>City</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>State</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Applicant Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Created By</TableCell>
                    {!shouldHideAction && (
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px', textAlign: 'center' }}>Actions</TableCell>
                    )}
                  </TableRow>
                ) : isHierarchyType ? (
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 700 }}>Position</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Client</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Total Candidates</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Assigned To</TableCell>
                  </TableRow>
                ) : (
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Applicant ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Applicant Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Job Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Sourced By</TableCell>
                    {currentUser?.role !== 'REPORTING_TEAM' && !isClientInterviewsForCEO && (
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textAlign: 'center' }}>Actions</TableCell>
                    )}
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {isJobsType ? (
                  modalData.map((app: any) => {
                    const jobCodeVal = getRemarkFieldVal(app.remarks, 'Job Code');
                    const recruiterEmails = app.associatedApps?.map((a: any) => a.assigned_employee?.email?.toLowerCase()).filter(Boolean) || [];
                    const recruitersText = Array.from(new Set(
                      app.associatedApps
                        ?.map((a: any) => a.assigned_employee?.full_name || a.recruiter)
                        .filter(Boolean)
                    )).join(', ');
                    const hierarchyInfo = getHierarchyInfo(recruiterEmails);
                    const creationDateText = app.created_at ? new Date(app.created_at).toLocaleString('en-US', { hour12: true }) : '—';
                    const salaryInfo = getSalaryInfo(app.remarks || '');

                    return (
                      <TableRow key={app.id} sx={{ whiteSpace: currentUser?.role === 'REPORTING_TEAM' ? 'nowrap' : undefined }}>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="subtitle2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem', color: jobCodeVal !== 'N/A' ? 'inherit' : 'text.disabled' }}>
                            {renderCellText(jobCodeVal !== 'N/A' ? jobCodeVal : '—', 95)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem', fontWeight: 700 }}>
                            {renderCellText(app.position, 140)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                            <Building size={14} /> {renderCellText(app.client_name, 120)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const loc = getRemarkFieldVal(app.remarks, 'Location');
                              const val = loc !== 'N/A' ? loc : [app.city, app.state].filter(Boolean).join(', ') || '—';
                              return renderCellText(val, 120);
                            })()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem', color: getRemarkFieldVal(app.remarks, 'Job Status') === 'Active' ? 'success.main' : 'text.secondary' }}>
                            {getRemarkFieldVal(app.remarks, 'Job Status')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const billRate = getRemarkFieldVal(app.remarks, 'Client Bill Rate');
                              if (billRate !== 'N/A') return renderCellText(billRate, 100);
                              const salary = getRemarkFieldVal(app.remarks, 'Salary');
                              if (salary !== 'N/A') return renderCellText(salary, 100);
                              return '—';
                            })()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const payRate = getRemarkFieldVal(app.remarks, 'Pay Rate');
                              if (payRate !== 'N/A') return renderCellText(payRate, 100);
                              return '—';
                            })()}
                          </Typography>
                        </TableCell>
                        {showFullJobsLayout && (
                          <>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(hierarchyInfo.manager, 110)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(hierarchyInfo.tl, 110)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(recruitersText, 120)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(creationDateText, 140)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(salaryInfo.min, 100)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(salaryInfo.max, 100)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: isCEOOroughReportingTeam ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: isCEOOroughReportingTeam ? '0.7rem' : '0.75rem', fontWeight: 600 }}>
                                {renderCellText(salaryInfo.avg, 100)}
                              </Typography>
                            </TableCell>
                          </>
                        )}
                        {!shouldHideAction && (
                          <TableCell sx={{ padding: '4px 8px', textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                              <Typography 
                                variant="body2" 
                                sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontSize: '0.75rem', fontWeight: 700 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/job-postings`);
                                }}
                              >
                                Edit
                              </Typography>
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                ) : isApplicantsType ? (
                  uniqueCandidates.map((cand) => {
                    const app = cand.primaryApp;
                    const isExpanded = !!expandedCandidates[cand.key];
                    return (
                      <React.Fragment key={cand.key}>
                        <TableRow sx={{ borderBottom: isExpanded ? 'none' : `1px solid ${theme.palette.divider}` }}>
                          <TableCell sx={{ padding: '4px 8px', textAlign: 'center' }}>
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
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{app.id}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={() => {
                                navigate(`/candidates/${app.id}/details`);
                              }}
                            >
                              {renderCellText(app.candidate_name, 120)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.candidate_email, 140)}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(getRemarkFieldVal(app.remarks, 'Job Code'), 90)}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.city || '—', 90)}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.state || '—', 90)}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'primary.main' }}>
                              {app.status}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="subtitle2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 750 }}>{renderCellText(app.position, 150)}</Typography>
                          </TableCell>
                          <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                            <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>{renderCellText(app.recruiter || app.assigned_employee?.full_name || 'System', 110)}</Typography>
                          </TableCell>
                          {!shouldHideAction && (
                            <TableCell sx={{ padding: '4px 8px', textAlign: 'center' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                  onClick={() => {
                                    navigate(`/candidates/create/${app.id}`);
                                  }}
                                >
                                  Edit
                                </Typography>
                              </Box>
                            </TableCell>
                          )}
                        </TableRow>
                        {isExpanded && (
                          <TableRow sx={{ backgroundColor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                            <TableCell colSpan={shouldHideAction ? 10 : 11} sx={{ padding: '16px 24px' }}>
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
                                  {cand.allSubmissions.map((sub: any) => (
                                    <TableRow key={sub.id}>
                                      <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{getRemarkFieldVal(sub.remarks, 'Job Code')}</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem', py: 1, fontWeight: 700 }}>{sub.position}</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{sub.recruiter || sub.assigned_employee?.full_name || 'System'}</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem', py: 1, fontWeight: 750, color: 'primary.main' }}>{sub.status}</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem', py: 1 }}>{sub.client_name}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : isHierarchyType ? (
                  modalData.map((app: any) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{app.position}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Building size={12} /> {app.client_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {(() => {
                            const matches = applications.filter((a: any) =>
                              a.candidate_name &&
                              a.position?.toLowerCase() === app.position?.toLowerCase() &&
                              a.client_name?.toLowerCase() === app.client_name?.toLowerCase() &&
                              a.technology?.toLowerCase() === app.technology?.toLowerCase()
                            );
                            const seen = new Set<string>();
                            const count = matches.filter((a: any) => {
                              const email = a.candidate_email?.toLowerCase() || '';
                              if (!email || seen.has(email)) return false;
                              seen.add(email);
                              return true;
                            }).length;
                            return count;
                          })()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          {app.status}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {app.recruiter || app.assigned_employee?.full_name || 'System'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  modalData.map((app: any) => (
                    <TableRow key={app.id}>
                      <TableCell sx={{ fontSize: '0.7rem' }}>{app.id}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main' }}>
                        {app.candidate_name || 'N/A'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.7rem' }}>{app.candidate_email || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem' }}>{getRemarkFieldVal(app.remarks, 'Job Code')}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{app.position}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main' }}>{app.status}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem' }}>
                        {app.recruiter || app.assigned_employee?.full_name || 'System'}
                      </TableCell>
                      {currentUser?.role !== 'REPORTING_TEAM' && !isClientInterviewsForCEO && (
                        <TableCell sx={{ fontSize: '0.7rem', textAlign: 'center' }}>
                          {app.candidate_name && (
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={() => {
                                navigate(`/candidates/create/${app.id}`);
                              }}
                            >
                              Edit
                            </Typography>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
                {modalData.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={
                        isJobsType
                           ? (shouldHideAction ? (isCEOOroughReportingTeam ? 14 : 7) : (isCEOOroughReportingTeam ? 15 : 8))
                           : isApplicantsType
                           ? (shouldHideAction ? 10 : 11)
                           : isHierarchyType
                           ? 5
                           : ((currentUser?.role !== 'REPORTING_TEAM' && !isClientInterviewsForCEO) ? 8 : 7)
                      }
                      sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}
                    >
                      No data found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

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
    </Container>
  );
};
