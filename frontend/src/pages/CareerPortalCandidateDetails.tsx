import React, { useState, useEffect } from 'react';
import { formatDateDDMMYYYY } from '../utils/formatters';
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
  Chip,
  CircularProgress
} from '@mui/material';
import { ArrowLeft, Briefcase, MapPin, Mail, Phone, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { CareerPortalApplicant } from '../types';

export const CareerPortalCandidateDetails: React.FC = () => {
  const { applicantId } = useParams<{ applicantId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const [applicant, setApplicant] = useState<CareerPortalApplicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (applicantId) {
      setLoading(true);
      api.get(`applications/career-portal-applicants/${applicantId}/`)
        .then((res: any) => {
          setApplicant(res.data);
        })
        .catch((err: any) => {
          console.error("Failed to fetch career portal applicant details", err);
          setError("Failed to load candidate details.");
        })
        .finally(() => setLoading(false));
    }
  }, [applicantId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !applicant) {
    return (
      <Box sx={{ p: 4 }}>
        <Button
          startIcon={<ArrowLeft size={18} />}
          onClick={() => navigate('/job-postings')}
          sx={{ mb: 3, fontWeight: 700, textTransform: 'none' }}
        >
          Back to Job Postings
        </Button>
        <Typography variant="h6" color="error">{error || "Candidate not found."}</Typography>
      </Box>
    );
  }

  const fullName = `${applicant.first_name} ${applicant.last_name}`.trim();

  return (
    <Box sx={{ pb: 6, px: { xs: 2, md: 4 }, pt: 2 }}>
      {/* Back Button & Page Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Button
          startIcon={<ArrowLeft size={18} />}
          onClick={() => navigate('/job-postings')}
          variant="outlined"
          sx={{ borderRadius: '8px', fontWeight: 700, textTransform: 'none', px: 2 }}
        >
          Back to Job Postings
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Career Portal Candidate Details
        </Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
            {/* Top Identity Banner */}
            <Box
              sx={{
                bgcolor: theme.palette.mode === 'light' ? 'primary.50' : 'background.paper',
                p: 4,
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
                flexWrap: 'wrap',
                gap: 2
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Avatar sx={{ width: 80, height: 80, fontSize: '2.2rem', bgcolor: 'primary.main', fontWeight: 800 }}>
                  {applicant.first_name?.charAt(0) || 'C'}
                </Avatar>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
                    {fullName}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Briefcase size={18} /> Candidate ID: #{applicant.id} • {applicant.source}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 3, mt: 2, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                      <Mail size={16} /> {applicant.email}
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                      <Phone size={16} /> {applicant.mobile_number}
                    </Typography>
                    {(applicant.city || applicant.state) && (
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, color: 'text.secondary' }}>
                        <MapPin size={16} /> {applicant.city}{applicant.state ? `, ${applicant.state}` : ''}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <Chip
                  label={applicant.status || 'New'}
                  color="primary"
                  variant="filled"
                  sx={{ fontWeight: 800, fontSize: '0.85rem', px: 1.5, py: 2 }}
                />
              </Box>
            </Box>

            {/* Comprehensive Metadata Section */}
            <Box sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>
                Candidate Overview & Information
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Primary Skills / Tech Stack</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.primary_skills || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Years of Experience</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.years_of_experience} Years</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Qualification / Degree</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.qualification || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Current Company</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.current_company || 'N/A'}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Current CTC</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {applicant.current_ctc ? `₹${Number(applicant.current_ctc).toLocaleString()}` : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Expected Pay</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                    {applicant.expected_pay ? `₹${Number(applicant.expected_pay).toLocaleString()}` : 'N/A'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Alternate Mobile Number</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.alternate_mobile_number || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Status Modified By</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.modified_by || 'N/A'}</Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Application Source</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{applicant.source}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Applied Date</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>{formatDateDDMMYYYY(applicant.created_at)}</Typography>
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>Resume Document</Typography>
                  {applicant.resume ? (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<ExternalLink size={16} />}
                      onClick={async () => {
                        try {
                          const res: any = await api.post('applications/generate-resume-url/', { url: applicant.resume });
                          window.open(res.data.url, '_blank', 'noopener,noreferrer');
                        } catch (err: any) {
                          const errMsg = err?.response?.data?.error || err?.message || 'Unknown error';
                          alert(`Failed to load resume: ${errMsg}`);
                        }
                      }}
                      sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 3 }}
                    >
                      View Resume Document
                    </Button>
                  ) : (
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>Not Provided</Typography>
                  )}
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};
