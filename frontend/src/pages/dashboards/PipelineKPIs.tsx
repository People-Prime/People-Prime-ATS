import React from 'react';
import {
  Grid,
  Card,
  Typography,
  useTheme,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../redux/store';
import {
  Send,
  CalendarClock,
  ThumbsDown,
  MailCheck,
  BadgeCheck,
  Briefcase,
  Building,
  X
} from 'lucide-react';

export const getUniqueSubmissions = (apps: any[]) => {
  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
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

  const candidateGroups: Record<string, any[]> = {};
  apps.forEach(app => {
    if (!app.candidate_name) return;
    const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
    if (!candidateGroups[key]) {
      candidateGroups[key] = [];
    }
    candidateGroups[key].push(app);
  });

  const uniqueApps: any[] = [];
  apps.forEach(app => {
    if (!app.candidate_name) {
      uniqueApps.push(app);
      return;
    }
    const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
    const group = candidateGroups[key] || [];
    const hasRealJob = group.some(a => getRemarkFieldVal(a.remarks, 'Job Code') !== 'N/A');
    if (hasRealJob) {
      if (getRemarkFieldVal(app.remarks, 'Job Code') !== 'N/A') {
        uniqueApps.push(app);
      }
    } else {
      if (app.id === group[0].id) {
        uniqueApps.push(app);
      }
    }
  });

  return uniqueApps;
};

interface PipelineKPIsProps {
  applications: Array<{
    id: string;
    candidate_name?: string;
    candidate_email?: string;
    candidate_phone?: string;
    position?: string;
    client_name?: string;
    recruiter?: string;
    assigned_employee?: {
      full_name: string;
      email: string;
    } | null;
    remarks?: string;
    status: string;
    associatedApps?: any[];
  }>;
}

/**
 * Reusable Pipeline KPIs bar – same coloured cards as the Team Lead dashboard.
 * Counts are derived from the passed `applications` slice so each dashboard
 * can supply its own scope (all-org, team, or personal).
 */
export const PipelineKPIs: React.FC<PipelineKPIsProps> = ({ applications }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector((state: any) => state.auth);
  const { users } = useAppSelector((state: any) => state.users || { users: [] });
  const [clickedTextValue, setClickedTextValue] = React.useState<string | null>(null);

  const isTargetDashboard = ['ADMIN', 'CEO', 'REPORTING_TEAM'].includes(currentUser?.role);
  const isCEOOroughReportingTeam = currentUser?.role === 'CEO' || currentUser?.role === 'REPORTING_TEAM';
  const shouldHideAction = ['ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'REPORTING_TEAM', 'CEO'].includes(currentUser?.role);

  const renderCellText = (text: string | null | undefined, maxWidth: number = 130) => {
    const val = text || 'N/A';
    if (currentUser?.role === 'CEO') {
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

  const uniqueApps = getUniqueSubmissions(applications);

  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
  };

  const validApps = uniqueApps.filter(app => !app.candidate_name || getRemarkFieldVal(app.remarks, 'Job Code') !== 'N/A');

  const seenJobs = new Set<string>();
  applications.forEach(app => {
    const jobCode = getRemarkFieldVal(app.remarks, 'Job Code');
    if (jobCode === 'N/A' || !jobCode) return;
    seenJobs.add(jobCode.toUpperCase().trim());
  });
  const jobsCount = seenJobs.size;

  const submissions = validApps.filter(app =>
    app.candidate_name &&
    ['Submitted', 'Under Review', 'Placed'].includes(app.status)
  ).length;
  const clientSubmissions = submissions;
  const clientInterviews = validApps.filter(app =>
    ['Interview Scheduled', 'Interview Completed'].includes(app.status)
  ).length;
  const clientRejections = validApps.filter(app => app.status === 'Rejected').length;
  const offerSent = validApps.filter(app => app.status === 'Offer Sent').length;
  const offerAccepted = validApps.filter(app => app.status === 'Offer Accepted').length;
  const placed = validApps.filter(app => app.status === 'Placed').length;

  const [open, setOpen] = React.useState(false);
  const [modalTitle, setModalTitle] = React.useState('');
  const [modalData, setModalData] = React.useState<any[]>([]);

  const handleCardClick = (label: string, value: number) => {
    if (value === 0) return;
    let filtered: any[] = [];
    if (label === 'Jobs Count') {
      const seen = new Set<string>();
      applications.forEach(app => {
        const jobCode = getRemarkFieldVal(app.remarks, 'Job Code');
        if (jobCode === 'N/A' || !jobCode) return;
        const key = jobCode.toUpperCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          const group = applications.filter(a => {
            const code = getRemarkFieldVal(a.remarks, 'Job Code');
            return code && code.toUpperCase().trim() === key;
          });
          const rep = { ...(group.find(a => !a.candidate_name) || group[0]) };
          rep.associatedApps = group;
          filtered.push(rep);
        }
      });
    } else if (label === 'Submissions') {
      filtered = validApps.filter(app =>
        app.candidate_name &&
        ['Submitted', 'Under Review', 'Placed'].includes(app.status)
      );
    } else if (label === 'Pending Feedback') {
      filtered = validApps.filter(app => app.status === 'Under Review');
    } else if (label === 'Client Submissions') {
      filtered = validApps.filter(app =>
        app.candidate_name &&
        ['Submitted', 'Under Review', 'Placed'].includes(app.status)
      );
    } else if (label === 'Client Interviews') {
      filtered = validApps.filter(app => ['Interview Scheduled', 'Interview Completed'].includes(app.status));
    } else if (label === 'Client Rejections') {
      filtered = validApps.filter(app => app.status === 'Rejected');
    } else if (label === 'Offer Sent') {
      filtered = validApps.filter(app => app.status === 'Offer Sent');
    } else if (label === 'Offer Accepted') {
      filtered = validApps.filter(app => app.status === 'Offer Accepted');
    } else if (label === 'Onboard') {
      filtered = validApps.filter(app => app.status === 'Placed');
    }

    setModalTitle(label);
    setModalData(filtered);
    setOpen(true);
  };

  const cards = [
    { label: 'Jobs Count', value: jobsCount, Icon: Briefcase, border: '#3b82f6', darkColor: '#60a5fa', lightColor: '#3b82f6', darkBg: 'rgba(59, 130, 246, 0.15)', lightBg: '#eff6ff' },
    { label: 'Client Submissions', value: clientSubmissions, Icon: Send, border: '#7c3aed', darkColor: '#a78bfa', lightColor: '#7c3aed', darkBg: 'rgba(124, 58, 237, 0.15)', lightBg: '#faf5ff' },
    { label: 'Client Interviews', value: clientInterviews, Icon: CalendarClock, border: '#16a34a', darkColor: '#4ade80', lightColor: '#16a34a', darkBg: 'rgba(22, 163, 74, 0.15)', lightBg: '#f0fdf4' },
    { label: 'Client Rejections', value: clientRejections, Icon: ThumbsDown, border: '#db2777', darkColor: '#f472b6', lightColor: '#db2777', darkBg: 'rgba(219, 39, 119, 0.15)', lightBg: '#fdf2f8' },
    { label: 'Offer Sent', value: offerSent, Icon: MailCheck, border: '#eab308', darkColor: '#facc15', lightColor: '#ca8a04', darkBg: 'rgba(234, 179, 8, 0.15)', lightBg: '#fefce8' },
    { label: 'Offer Accepted', value: offerAccepted, Icon: BadgeCheck, border: '#475569', darkColor: '#94a3b8', lightColor: '#475569', darkBg: 'rgba(71, 85, 105, 0.15)', lightBg: '#f8fafc' },
    { label: 'Onboard', value: placed, Icon: Briefcase, border: '#d946ef', darkColor: '#e879f9', lightColor: '#d946ef', darkBg: 'rgba(217, 70, 239, 0.15)', lightBg: '#fae8ff' },
  ];

  const isDark = theme.palette.mode === 'dark';

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 800, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Dashboards KPIs
        </Typography>
      </Box>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {cards.map((card) => {
          const { Icon } = card;
          const iconColor = isDark ? '#3b82f6' : '#0062AD';
          const iconBg = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0, 98, 173, 0.08)';
          return (
            <Grid item xs={6} sm={3} md={1.7} key={card.label}>
              <Card
                onClick={() => handleCardClick(card.label, card.value)}
                sx={{
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '12px',
                  textAlign: 'left',
                  height: '100%',
                  p: 2,
                  boxShadow: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '88px',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: card.value > 0 ? 'pointer' : 'default',
                  '&:hover': card.value > 0 ? {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 12px rgba(0, 98, 173, 0.08)'
                  } : {}
                }}
              >
                {/* Contextual icon badge – top right corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    bgcolor: iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} color={iconColor} strokeWidth={2.2} />
                </Box>

                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}
                >
                  {card.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', lineHeight: 1.2 }}
                >
                  {card.label}
                </Typography>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem' }}>
            {modalTitle === 'Jobs Count' && isTargetDashboard
              ? `Job Postings (${modalData.length})`
              : `${modalTitle} Candidates (${modalData.length})`}
          </Typography>
          <IconButton onClick={() => setOpen(false)} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                {modalTitle === 'Jobs Count' && isTargetDashboard ? (
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Title</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Client</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Client Bill Rate / Salary</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Pay Rate / Salary</TableCell>
                    {isCEOOroughReportingTeam && (
                      <>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Manager</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>TL</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Recruiter</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Job Created</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Min Sal</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Max Sal</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px' }}>Avg Sal</TableCell>
                      </>
                    )}
                    {!shouldHideAction && (
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', padding: currentUser?.role === 'CEO' ? '2px 4px' : '6px 8px', textAlign: 'center' }}>Action</TableCell>
                    )}
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
                    {currentUser?.role !== 'REPORTING_TEAM' && (
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textAlign: 'center' }}>Actions</TableCell>
                    )}
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {modalTitle === 'Jobs Count' && isTargetDashboard ? (
                  modalData.map((app) => {
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
                      <TableRow key={app.id}>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="subtitle2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', color: jobCodeVal !== 'N/A' ? 'inherit' : 'text.disabled' }}>
                            {renderCellText(jobCodeVal !== 'N/A' ? jobCodeVal : '—', 95)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 700 }}>
                            {renderCellText(app.position, 140)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                            <Building size={14} /> {renderCellText(app.client_name, 120)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const loc = getRemarkFieldVal(app.remarks, 'Location');
                              const val = loc !== 'N/A' ? loc : [app.city, app.state].filter(Boolean).join(', ') || '—';
                              return renderCellText(val, 120);
                            })()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', color: getRemarkFieldVal(app.remarks, 'Job Status') === 'Active' ? 'success.main' : 'text.secondary' }}>
                            {getRemarkFieldVal(app.remarks, 'Job Status')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const billRate = getRemarkFieldVal(app.remarks, 'Client Bill Rate');
                              if (billRate !== 'N/A') return renderCellText(billRate, 100);
                              const salary = getRemarkFieldVal(app.remarks, 'Salary');
                              if (salary !== 'N/A') return renderCellText(salary, 100);
                              return '—';
                            })()}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                          <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                            {(() => {
                              const payRate = getRemarkFieldVal(app.remarks, 'Pay Rate');
                              if (payRate !== 'N/A') return renderCellText(payRate, 100);
                              return '—';
                            })()}
                          </Typography>
                        </TableCell>
                        {isCEOOroughReportingTeam && (
                          <>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(hierarchyInfo.manager, 110)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(hierarchyInfo.tl, 110)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(recruitersText, 120)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(creationDateText, 140)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(salaryInfo.min, 100)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem' }}>
                                {renderCellText(salaryInfo.max, 100)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: currentUser?.role === 'CEO' ? '2px 4px' : '4px 8px' }}>
                              <Typography variant="body2" sx={{ fontSize: currentUser?.role === 'CEO' ? '0.7rem' : '0.75rem', fontWeight: 600 }}>
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
                                  setOpen(false);
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
                ) : (
                  modalData.map((app) => (
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
                      {currentUser?.role !== 'REPORTING_TEAM' && (
                        <TableCell sx={{ fontSize: '0.7rem', textAlign: 'center' }}>
                          {app.candidate_name && (
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={() => {
                                setOpen(false);
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
                        modalTitle === 'Jobs Count' && isTargetDashboard
                          ? (shouldHideAction ? (isCEOOroughReportingTeam ? 14 : 7) : (isCEOOroughReportingTeam ? 15 : 8))
                          : (currentUser?.role !== 'REPORTING_TEAM' ? 8 : 7)
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
        </DialogContent>
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
    </>
  );
};
