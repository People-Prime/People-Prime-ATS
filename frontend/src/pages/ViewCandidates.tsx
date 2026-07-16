import React, { useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Card, 
  CardContent,
  Typography, 
  Button, 
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Grid
} from '@mui/material';
import { ArrowLeft, Building, Wrench, Briefcase, Users } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../redux/store';
import { setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';

export const ViewCandidates: React.FC = () => {
  const navigate = useNavigate();
  const { applicationId } = useParams<{ applicationId: string }>();
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const { applications } = useAppSelector(state => state.applications);

  // Load applications from API on mount
  useEffect(() => {
    api.get('applications/').then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(() => {});
  }, [dispatch]);

  // Find the selected job requirement application
  const selectedApp = useMemo(() => {
    return applications.find(app => String(app.id) === String(applicationId));
  }, [applications, applicationId]);

  // Find all unique candidates matching selected job requirement parameters (position, client, tech stack)
  const jobCandidates = useMemo(() => {
    if (!selectedApp) return [];
    
    const matches = applications.filter(app => 
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
  }, [selectedApp, applications]);

  // Status Chip helper
  const getStatusChip = (status: string) => {
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
    return (
      <Chip 
        label={status} 
        color={statusColors[status] || 'default'} 
        size="small" 
        sx={{ fontWeight: 600, borderRadius: '6px' }}
      />
    );
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

  if (!selectedApp) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="error" sx={{ mb: 2 }}>
          Job requirement not found.
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<ArrowLeft size={18} />} 
          onClick={() => navigate('/')}
          sx={{ borderRadius: '8px' }}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 4 } }}>
      {/* Header section with back navigation */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton 
          onClick={() => navigate('/')}
          sx={{ 
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            '&:hover': {
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            }
          }}
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Candidates View
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View all candidate applications matching this job opening.
          </Typography>
        </Box>
      </Box>

      {/* Job Details Card */}
      <Card sx={{ mb: 4, borderRadius: '16px', boxShadow: theme.shadows[2] }}>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Briefcase size={22} className="text-primary" style={{ color: theme.palette.primary.main }} />
                <Typography variant="h6" fontWeight={750}>
                  {selectedApp.position}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 1.5 }}>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: 'text.secondary' }}>
                  <Building size={16} /> Client: <strong>{selectedApp.client_name}</strong>
                </Typography>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: 'text.secondary' }}>
                  <Wrench size={16} /> Technology: <strong>{selectedApp.technology}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Experience Required: <strong>{selectedApp.experience} years</strong>
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4} sx={{ textAlign: { md: 'right' } }}>
              <Chip 
                icon={<Users size={16} style={{ marginRight: 4 }} />}
                label={`${jobCandidates.length} Unique Candidates`} 
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 700, px: 1, py: 2, borderRadius: '8px' }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Candidates Table */}
      <Card sx={{ borderRadius: '16px', boxShadow: theme.shadows[2] }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: '16px', bgcolor: 'transparent' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ borderBottom: `2px solid ${theme.palette.divider}` }}>
                  <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Candidate Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Email & Phone</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Sourced By</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobCandidates.map((candidate) => (
                  <TableRow key={candidate.id} hover sx={{ borderBottom: `1px solid ${theme.palette.divider}`, whiteSpace: 'nowrap' }}>
                    <TableCell sx={{ fontWeight: 700, py: 2, whiteSpace: 'nowrap' }}>
                      {renderCellText(candidate.candidate_name, 120)}
                    </TableCell>
                    <TableCell sx={{ py: 2, whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" fontWeight={500}>{renderCellText(candidate.candidate_email, 140)}</Typography>
                      <Typography variant="caption" color="text.secondary">{renderCellText(candidate.candidate_phone, 110)}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 2, color: 'text.secondary', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                      {renderCellText(candidate.recruiter || 'Self', 110)}
                    </TableCell>
                    <TableCell sx={{ py: 2, whiteSpace: 'nowrap' }}>
                      {getStatusChip(candidate.status)}
                    </TableCell>
                  </TableRow>
                ))}
                {jobCandidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      No candidates sourced for this job opening yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};
