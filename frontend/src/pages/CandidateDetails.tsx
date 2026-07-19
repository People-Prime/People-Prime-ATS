import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Avatar,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { ArrowLeft, Briefcase, MapPin, Mail, Phone, ExternalLink } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../redux/store';
import { setApplications, addApplication, updateApplication } from '../redux/applicationsSlice';
import { api } from '../services/api';

const extractField = (remarks: string, fieldName: string): string => {
  if (!remarks) return '';
  const regex = new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im');
  const match = remarks.match(regex);
  return match ? match[1].trim() : '';
};

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

export const CandidateDetails: React.FC = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const [openSubmitDialog, setOpenSubmitDialog] = React.useState(false);
  const [selectedJobIds, setSelectedJobIds] = React.useState<string[]>([]);
  const [submittingJobs, setSubmittingJobs] = React.useState(false);
  const [resumeLoading, setResumeLoading] = React.useState(false);

  const dispatch = useAppDispatch();

  React.useEffect(() => {
    api.get('applications/').then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(err => console.error("Failed to load applications", err));
  }, [dispatch]);

  const applications = useAppSelector(state => state.applications.applications);
  const currentUser = useAppSelector(state => state.auth.user);
  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  const uniqueTeamRequirements = React.useMemo(() => {
    const candidate = applications.find(a => String(a.id) === applicationId);
    if (!candidate) return [];

    // 1. Filter out standalone candidates (which have Job Code = N/A)
    const jobPostingApps = applications.filter(app => getRemarkField(app.remarks, 'Job Code') !== 'N/A');

    // 2. Filter by assignee role if associate
    const filtered = jobPostingApps.filter(app => {
      if (activeRole === 'ASSOCIATE_ANALYST' || activeRole === 'SENIOR_ANALYST') {
        return app.assigned_employee?.email?.toLowerCase() === currentUser?.email?.toLowerCase();
      }
      return true;
    });

    // 3. Group by position + client so we only show one entry per unique Job Posting in the list
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach(app => {
      const key = `${app.position?.toLowerCase().trim()}|${app.client_name?.toLowerCase().trim()}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(app);
    });

    // 4. Return the representative for each group (preferring the blank requirement if it exists)
    return Object.keys(groups).map(key => {
      const group = groups[key];
      const rep = group.find(a => !a.candidate_name) || group[0];
      return rep;
    });
  }, [applications, currentUser, activeRole, applicationId]);

  const selectedApp = applications.find(a => String(a.id) === applicationId);


  const handleToggleJob = (jobId: string) => {
    setSelectedJobIds(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  const handleJobSubmit = async () => {
    if (!selectedApp || selectedJobIds.length === 0) return;
    setSubmittingJobs(true);
    try {
      for (const jobId of selectedJobIds) {
        const job = applications.find(a => String(a.id) === jobId);
        if (!job) continue;

        const payload = {
          candidate_name: selectedApp.candidate_name,
          candidate_email: selectedApp.candidate_email,
          candidate_phone: selectedApp.candidate_phone,
          city: selectedApp.city,
          state: selectedApp.state,
          client_name: job.client_name,
          position: job.position,
          experience: selectedApp.experience,
          technology: selectedApp.technology,
          recruiter: selectedApp.recruiter || currentUser?.full_name || '',
          remarks: job.remarks,
          status: 'Submitted',
          assigned_employee_id: job.assigned_employee?.email || null
        };

        let res;
        if (!job.candidate_name) {
          // Fill blank requirement
          res = await api.put(`applications/${job.id}/`, payload);
          dispatch(updateApplication(res.data));
        } else {
          // Post new application record
          res = await api.post('applications/', payload);
          dispatch(addApplication(res.data));
        }

        await api.post(`applications/${res.data.id}/add-note/`, {
          content: `Submitted candidate "${selectedApp.candidate_name}" to this job opening.`
        });
      }
      
      alert("Successfully submitted candidate to selected jobs!");
      setSelectedJobIds([]);
      setOpenSubmitDialog(false);
    } catch (err: any) {
      console.error(err);
      const serverError = err.response?.data;
      let errMsg = "Failed to submit candidate to selected jobs.";
      if (serverError) {
        if (typeof serverError === 'object') {
          errMsg = Object.values(serverError).flat().join(' ');
        } else {
          errMsg = String(serverError);
        }
      }
      alert(errMsg);
    } finally {
      setSubmittingJobs(false);
    }
  };



  if (!selectedApp) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Candidate not found.</Typography>
        <Button onClick={() => navigate(-1)} startIcon={<ArrowLeft size={16} />}>Go Back</Button>
      </Box>
    );
  }

  const remarks = selectedApp.remarks || '';
  const parsedDetails = {
    location: extractField(remarks, 'Location') || 'N/A',
    workAuth: extractField(remarks, 'Work Auth') || 'N/A',
    salary: extractField(remarks, 'Expected Salary') || extractField(remarks, 'Salary') || 'N/A',
    noticePeriod: extractField(remarks, 'Notice Period') || 'N/A',
    resumeLink: extractField(remarks, 'Resume Link') || '',
    skills: extractField(remarks, 'Skills') || selectedApp.technology || 'N/A',
    jobType: extractField(remarks, 'Job Type') || 'N/A',
    workMode: extractField(remarks, 'Work Mode') || 'N/A',
    taxTerms: extractField(remarks, 'Tax Terms') || 'N/A',
    degree: extractField(remarks, 'Degree') || 'N/A',
    experience: selectedApp.experience ? `${selectedApp.experience} Years` : 'N/A'
  };

  return (
    <Box sx={{ pb: 5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Candidate Details</Typography>
      </Box>

      <Grid container spacing={4}>
        {/* Left Column: Full Details (Expanded to 12 cols) */}
        <Grid item xs={12} md={12}>
          <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
            {/* Top Banner / Identity */}
            <Box sx={{ bgcolor: theme.palette.mode === 'light' ? 'primary.50' : 'background.paper', p: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.palette.divider}`, gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Avatar sx={{ width: 80, height: 80, fontSize: '2rem', bgcolor: 'primary.main' }}>
                  {selectedApp.candidate_name?.charAt(0) || 'C'}
                </Avatar>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
                    {selectedApp.candidate_name || 'No Candidate Assigned'}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Briefcase size={18} /> {selectedApp.position} @ {selectedApp.client_name}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                      <Mail size={16} /> {selectedApp.candidate_email || 'N/A'}
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                      <Phone size={16} /> {selectedApp.candidate_phone || 'N/A'}
                    </Typography>
                    {selectedApp.city && (
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                        <MapPin size={16} /> {selectedApp.city}{selectedApp.state ? `, ${selectedApp.state}` : ''}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              <Button
                variant="contained"
                onClick={() => setOpenSubmitDialog(true)}
                sx={{ borderRadius: '8px', fontWeight: 700, px: 3 }}
              >
                Assign Job
              </Button>
            </Box>

            {/* Candidate Metadata Grid */}
            <Box sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>Comprehensive Overview</Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Primary Skills / Tech Stack</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.skills}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Years of Experience</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.experience}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Expected Salary / Rate</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>{parsedDetails.salary}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Notice Period</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.noticePeriod}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Work Mode</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.workMode}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Education / Degree</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.degree}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Job Type</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{parsedDetails.jobType}</Typography>
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Resume Link</Typography>
                  {parsedDetails.resumeLink ? (
                    <Box sx={{ mt: 0.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ExternalLink size={16} />}
                        disabled={resumeLoading}
                        onClick={async () => {
                          const resumeUrl = parsedDetails.resumeLink;
                          // If it's an S3 URL, generate a pre-signed link first
                          if (resumeUrl.includes('s3.') || resumeUrl.includes('amazonaws.com')) {
                            setResumeLoading(true);
                            try {
                              const res: any = await api.post('applications/generate-resume-url/', { url: resumeUrl });
                              window.open(res.data.url, '_blank', 'noopener,noreferrer');
                            } catch (err: any) {
                              const errMsg = err?.response?.data?.error || err?.message || 'Unknown error';
                              alert(`Failed to load resume: ${errMsg}`);
                            } finally {
                              setResumeLoading(false);
                            }
                          } else {
                            // Cloudinary or other direct URLs — open as-is
                            window.open(resumeUrl, '_blank', 'noopener,noreferrer');
                          }
                        }}
                      >
                        {resumeLoading ? 'Loading...' : 'View Resume Document'}
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>Not Provided</Typography>
                  )}
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Original Remarks & Sourcing Notes</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line', bgcolor: 'action.hover', p: 2, borderRadius: '8px', mt: 1 }}>
                    {selectedApp.remarks || 'No additional remarks available.'}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* JOB SUBMISSION POPUP DIALOG */}
      <Dialog 
        open={openSubmitDialog} 
        onClose={() => setOpenSubmitDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px' }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Assign Candidate to Job Openings</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select the jobs you want to assign <strong>{selectedApp.candidate_name}</strong> to:
          </Typography>
          
          {uniqueTeamRequirements.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
              No active job openings/requirements available in the Job Postings Pipeline.
            </Typography>
          ) : (
            <FormGroup>
              {uniqueTeamRequirements.map((job) => (
                <FormControlLabel
                  key={job.id}
                  control={
                    <Checkbox 
                      checked={selectedJobIds.includes(String(job.id))}
                      onChange={() => handleToggleJob(String(job.id))}
                      color="primary"
                    />
                  }
                  label={
                    <Box sx={{ py: 0.5 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {job.position}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Client: {job.client_name} • Tech Stack: {job.technology} • Exp Required: {job.experience} yrs
                      </Typography>
                    </Box>
                  }
                  sx={{ mb: 1, alignItems: 'flex-start' }}
                />
              ))}
            </FormGroup>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button 
            onClick={() => {
              setSelectedJobIds([]);
              setOpenSubmitDialog(false);
            }} 
            variant="outlined" 
            sx={{ borderRadius: '8px' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleJobSubmit} 
            variant="contained" 
            color="primary"
            disabled={selectedJobIds.length === 0 || submittingJobs}
            sx={{ borderRadius: '8px', fontWeight: 700 }}
          >
            {submittingJobs ? 'Assigning...' : 'Assign to Selected'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
