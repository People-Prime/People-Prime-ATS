import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Divider
} from '@mui/material';
import { ArrowLeft, Briefcase, MapPin, Building, Calendar, FileText } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../redux/store';
import { setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';

const getRemarkField = (remarks: string | undefined | null, fieldName: string): string => {
  if (!remarks) return 'N/A';
  const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
  const value = match ? match[1].trim() : 'N/A';
  return value && value !== '' ? value : 'N/A';
};

export const JobDetails: React.FC = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const dispatch = useAppDispatch();

  React.useEffect(() => {
    api.get('applications/').then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(err => console.error("Failed to load applications", err));
  }, [dispatch]);

  const applications = useAppSelector(state => state.applications.applications);
  const selectedApp = applications.find(a => String(a.id) === applicationId);

  if (!selectedApp) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Job posting not found.</Typography>
        <Button onClick={() => navigate(-1)} startIcon={<ArrowLeft size={16} />}>Go Back</Button>
      </Box>
    );
  }

  const remarks = selectedApp.remarks || '';
  const parsedDetails = {
    jobCode: getRemarkField(remarks, 'Job Code'),
    position: selectedApp.position || 'N/A',
    clientName: selectedApp.client_name || 'N/A',
    clientBillRate: getRemarkField(remarks, 'Client Bill Rate'),
    payRate: getRemarkField(remarks, 'Pay Rate') !== 'N/A' ? getRemarkField(remarks, 'Pay Rate') : getRemarkField(remarks, 'Salary'),
    startDate: getRemarkField(remarks, 'Start Date') !== 'N/A' ? getRemarkField(remarks, 'Start Date') : getRemarkField(remarks, 'Tentative Start Date'),
    location: getRemarkField(remarks, 'Location') !== 'N/A' ? getRemarkField(remarks, 'Location') : [selectedApp.city, selectedApp.state].filter(Boolean).join(', ') || 'N/A',
    jobType: getRemarkField(remarks, 'Job Type'),
    jobStatus: getRemarkField(remarks, 'Job Status') !== 'N/A' ? getRemarkField(remarks, 'Job Status') : 'Active',
    clientJobId: getRemarkField(remarks, 'Client Job ID'),
    noticePeriod: getRemarkField(remarks, 'Notice Period'),
    workMode: getRemarkField(remarks, 'Work Mode'),
    degree: getRemarkField(remarks, 'Degree'),
    taxTerms: getRemarkField(remarks, 'Tax Terms'),
    manager: getRemarkField(remarks, 'Manager'),
    teamLead: getRemarkField(remarks, 'Team Lead'),
    experience: selectedApp.experience ? `${selectedApp.experience} Years` : 'N/A',
    description: getRemarkField(remarks, 'Description') !== 'N/A' ? getRemarkField(remarks, 'Description') : getRemarkField(remarks, 'Remarks')
  };

  return (
    <Box sx={{ pb: 5, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button onClick={() => navigate(-1)} startIcon={<ArrowLeft size={16} />} variant="outlined" sx={{ borderRadius: '8px' }}>
          Back
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Job Posting Details</Typography>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
        {/* Top Banner */}
        <Box sx={{ bgcolor: theme.palette.mode === 'light' ? 'primary.50' : 'background.paper', p: 4, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>
            {parsedDetails.position}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Building size={18} /> {parsedDetails.clientName}
          </Typography>

          <Box sx={{ display: 'flex', gap: 3, mt: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
              <Briefcase size={16} /> Job Code: {parsedDetails.jobCode}
            </Typography>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
              <MapPin size={16} /> {parsedDetails.location}
            </Typography>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
              <Calendar size={16} /> Start Date: {parsedDetails.startDate}
            </Typography>
          </Box>
        </Box>

        {/* Detailed Grid */}
        <Box sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>Requirement Specifications</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Client Bill Rate</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.clientBillRate}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Pay Rate / Salary</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>{parsedDetails.payRate}</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Job Type</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.jobType}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Work Mode</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.workMode}</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Client Job ID</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.clientJobId}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Experience Required</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.experience}</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Notice Period Allowed</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.noticePeriod}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Required Qualification / Degree</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.degree}</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Tax Terms</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.taxTerms}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Job Status</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600, color: parsedDetails.jobStatus === 'Active' ? 'success.main' : 'text.secondary' }}>
                {parsedDetails.jobStatus}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Account Manager</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.manager}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Team Lead / Coordinator</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.teamLead}</Typography>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FileText size={16} /> Detailed Job Description
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', bgcolor: 'action.hover', p: 3, borderRadius: '8px', mt: 1.5, lineHeight: 1.6 }}>
                {parsedDetails.description !== 'N/A' && parsedDetails.description ? parsedDetails.description : 'No detailed description available.'}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Box>
  );
};
