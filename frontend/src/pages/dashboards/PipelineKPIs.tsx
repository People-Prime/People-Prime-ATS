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
  Users,
  MessageSquare,
  Send,
  CalendarClock,
  ThumbsDown,
  MailCheck,
  BadgeCheck,
  Briefcase,
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

  const uniqueApps = getUniqueSubmissions(applications);

  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
  };

  const validApps = uniqueApps.filter(app => !app.candidate_name || getRemarkFieldVal(app.remarks, 'Job Code') !== 'N/A');

  const submissions       = validApps.filter(app => app.candidate_name).length;
  const pendingFeedback   = validApps.filter(app => app.status === 'Under Review').length;
  const clientSubmissions = submissions;
  const clientInterviews  = validApps.filter(app =>
    ['Interview Scheduled', 'Interview Completed'].includes(app.status)
  ).length;
  const clientRejections  = validApps.filter(app => app.status === 'Rejected').length;
  const offerSent         = validApps.filter(app => app.status === 'Offer Sent').length;
  const offerAccepted     = validApps.filter(app => app.status === 'Offer Accepted').length;
  const placed            = validApps.filter(app => app.status === 'Placed').length;

  const [open, setOpen] = React.useState(false);
  const [modalTitle, setModalTitle] = React.useState('');
  const [modalData, setModalData] = React.useState<any[]>([]);

  const handleCardClick = (label: string, value: number) => {
    if (value === 0) return;
    let filtered: any[] = [];
    if (label === 'Submissions') {
      filtered = validApps.filter(app => app.candidate_name);
    } else if (label === 'Pending Feedback') {
      filtered = validApps.filter(app => app.status === 'Under Review');
    } else if (label === 'Client Submissions') {
      filtered = validApps.filter(app => app.candidate_name);
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
    { label: 'Submissions',        value: submissions,        Icon: Users,         border: '#f59e0b', darkColor: '#fbbf24', lightColor: '#d97706', darkBg: 'rgba(245, 158, 11, 0.15)',  lightBg: '#fffbeb' },
    { label: 'Pending Feedback',   value: pendingFeedback,    Icon: MessageSquare, border: '#0284c7', darkColor: '#38bdf8', lightColor: '#0284c7', darkBg: 'rgba(2, 132, 199, 0.15)',   lightBg: '#f0f9ff' },
    { label: 'Client Submissions', value: clientSubmissions,  Icon: Send,          border: '#7c3aed', darkColor: '#a78bfa', lightColor: '#7c3aed', darkBg: 'rgba(124, 58, 237, 0.15)',  lightBg: '#faf5ff' },
    { label: 'Client Interviews',  value: clientInterviews,   Icon: CalendarClock, border: '#16a34a', darkColor: '#4ade80', lightColor: '#16a34a', darkBg: 'rgba(22, 163, 74, 0.15)',   lightBg: '#f0fdf4' },
    { label: 'Client Rejections',  value: clientRejections,   Icon: ThumbsDown,    border: '#db2777', darkColor: '#f472b6', lightColor: '#db2777', darkBg: 'rgba(219, 39, 119, 0.15)', lightBg: '#fdf2f8' },
    { label: 'Offer Sent',         value: offerSent,          Icon: MailCheck,     border: '#eab308', darkColor: '#facc15', lightColor: '#ca8a04', darkBg: 'rgba(234, 179, 8, 0.15)',   lightBg: '#fefce8' },
    { label: 'Offer Accepted',     value: offerAccepted,      Icon: BadgeCheck,    border: '#475569', darkColor: '#94a3b8', lightColor: '#475569', darkBg: 'rgba(71, 85, 105, 0.15)',   lightBg: '#f8fafc' },
    { label: 'Onboard',            value: placed,             Icon: Briefcase,     border: '#d946ef', darkColor: '#e879f9', lightColor: '#d946ef', darkBg: 'rgba(217, 70, 239, 0.15)',  lightBg: '#fae8ff' },
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
          const iconBg    = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0, 98, 173, 0.08)';
          return (
            <Grid item xs={6} sm={3} md={1.5} key={card.label}>
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
            {modalTitle} Candidates ({modalData.length})
          </Typography>
          <IconButton onClick={() => setOpen(false)} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
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
              </TableHead>
              <TableBody>
                {modalData.map((app) => (
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
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {modalData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={currentUser?.role !== 'REPORTING_TEAM' ? 8 : 7} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                      No data found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </>
  );
};
