import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Chip,
  TextField,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Container,
  Card,
  CardContent,
  Stack,
} from '@mui/material';
import {
  MapPin,
  Clock,
  Award,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Building2,
  Send,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { publicApi } from '../services/api';

interface PublicJob {
  id: number;
  job_code: string | null;
  position: string;
  technology: string;
  required_skills: string[];
  experience: string | null;
  city: string;
  state: string;
  location: string | null;
  job_type: string | null;
  work_mode: string | null;
  notice_period: string | null;
  description: string | null;
  required_documents: string | null;
  published_at: string | null;
  created_at: string;
}

interface PublicJobDetailsProps {
  themeMode?: 'light' | 'dark';
  toggleTheme?: () => void;
}

export const PublicJobDetails: React.FC<PublicJobDetailsProps> = ({ themeMode, toggleTheme }) => {
  const [searchParams] = useSearchParams();
  const params = useParams<{ jobId?: string }>();
  const theme = useTheme();

  // Support both /job-details?id=<ID>&src=LinkedIn and /job-details/:jobId
  const jobId = searchParams.get('id') || params.jobId || '';
  const src = searchParams.get('src') || searchParams.get('source') || 'Company Career Portal';

  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    qualification: '',
    yearsOfExperience: '',
    currentCompany: '',
    currentCtc: '',
    expectedPay: '',
    primarySkills: '',
    city: '',
    state: '',
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || isNaN(Number(jobId))) {
      setError("No valid job ID specified in the application link.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    publicApi.get(`public/jobs/${jobId}/`)
      .then((res) => {
        setJob(res.data);
      })
      .catch((err) => {
        console.error("[PublicJobDetails] Failed to fetch job details:", err);
        if (err.response?.status === 404) {
          setError("This job posting is no longer active, has expired, or is not available for public application.");
        } else {
          setError("Unable to retrieve job information at this moment. Please try again later.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [jobId]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResumeError(null);

    if (!file) {
      setResumeFile(null);
      return;
    }

    const allowedExts = ['.pdf', '.doc', '.docx'];
    const fileName = file.name.toLowerCase();
    const isValidExt = allowedExts.some((ext) => fileName.endsWith(ext));

    if (!isValidExt) {
      setResumeError("Unsupported format. Please upload a PDF, DOC, or DOCX document.");
      setResumeFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setResumeError("File size exceeds 10 MB limit.");
      setResumeFile(null);
      return;
    }

    setResumeFile(file);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) errors.firstName = "First Name is required.";
    if (!formData.email.trim()) {
      errors.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    const cleanMobile = formData.mobileNumber.replace(/\D/g, '');
    if (!cleanMobile) {
      errors.mobileNumber = "Mobile Number is required.";
    } else if (cleanMobile.length < 10) {
      errors.mobileNumber = "Mobile Number must contain at least 10 digits.";
    }

    if (!formData.qualification.trim()) errors.qualification = "Qualification is required.";
    if (!formData.yearsOfExperience.trim()) errors.yearsOfExperience = "Years of experience is required.";
    if (!formData.currentCompany.trim()) errors.currentCompany = "Current company is required.";
    if (!formData.currentCtc.trim()) errors.currentCtc = "Current CTC is required.";
    if (!formData.expectedPay.trim()) errors.expectedPay = "Expected Pay is required.";
    if (!formData.primarySkills.trim()) errors.primarySkills = "Key skills are required.";
    if (!formData.city.trim()) errors.city = "City is required.";
    if (!formData.state.trim()) errors.state = "State is required.";

    if (!resumeFile) {
      errors.resume = "Please attach your resume file (PDF, DOC, DOCX).";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErrorMessage(null);

    if (!validateForm()) {
      return;
    }

    if (!jobId || !resumeFile) return;

    setSubmitting(true);

    try {
      const data = new FormData();
      data.append('first_name', formData.firstName.trim());
      data.append('last_name', formData.lastName.trim() || 'N/A');
      data.append('email', formData.email.trim());
      data.append('mobile_number', formData.mobileNumber.replace(/\D/g, '').slice(-10));
      data.append('qualification', formData.qualification.trim());
      data.append('years_of_experience', formData.yearsOfExperience.trim());
      data.append('current_company', formData.currentCompany.trim());
      data.append('current_ctc', formData.currentCtc.trim());
      data.append('expected_pay', formData.expectedPay.trim());
      data.append('primary_skills', formData.primarySkills.trim());
      data.append('city', formData.city.trim());
      data.append('state', formData.state.trim());
      data.append('resume', resumeFile);
      data.append('source', src);

      const response = await publicApi.post(`public/jobs/${jobId}/apply/`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.success) {
        setSubmitSuccess(true);
      } else {
        setSubmitErrorMessage("Submission could not be completed. Please review your details and try again.");
      }
    } catch (err: any) {
      console.error("[PublicJobDetails] Application submission failed:", err);
      const backendErrors = err.response?.data?.errors;
      if (backendErrors && typeof backendErrors === 'object') {
        const errorMessages = Object.entries(backendErrors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join(' | ');
        setSubmitErrorMessage(errorMessages || "Submission rejected by validation rules.");
      } else {
        setSubmitErrorMessage(err.response?.data?.message || "An unexpected network error occurred while submitting your application.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isDarkMode = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: isDarkMode ? 'background.default' : '#f8fafc',
        color: 'text.primary',
        pb: 8,
      }}
    >
      {/* Top Public Header */}
      <Paper
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: isDarkMode ? 'background.paper' : '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 2,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  p: 1,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Building2 size={24} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  People Prime Worldwide
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Career & Talent Opportunities
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              {src && (
                <Chip
                  label={src === 'Company Career Portal' ? src : `Referral Source: ${src}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                />
              )}
              {toggleTheme && (
                <IconButton onClick={toggleTheme} color="inherit" size="small" aria-label="Toggle theme mode">
                  {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </IconButton>
              )}
            </Stack>
          </Box>
        </Container>
      </Paper>

      {/* Main Content Area */}
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {loading && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50vh',
              gap: 2,
            }}
          >
            <CircularProgress size={44} />
            <Typography variant="body1" sx={{ color: 'text.secondary' }}>
              Loading job opportunity details...
            </Typography>
          </Box>
        )}

        {!loading && error && (
          <Paper
            elevation={2}
            sx={{
              p: 5,
              textAlign: 'center',
              borderRadius: 3,
              maxWidth: 600,
              mx: 'auto',
              mt: 6,
            }}
          >
            <Box sx={{ color: 'warning.main', mb: 2 }}>
              <AlertCircle size={56} style={{ margin: '0 auto' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5 }}>
              Position Unavailable
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
              {error}
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: 'text.disabled', mb: 3 }}>
              Reference Job ID: {jobId || 'N/A'}
            </Typography>
            <Button
              variant="contained"
              onClick={() => window.location.href = 'https://people-prime.com'}
              sx={{ textTransform: 'none', px: 4 }}
            >
              Visit People Prime Homepage
            </Button>
          </Paper>
        )}

        {!loading && !error && job && (
          <Grid container spacing={4}>
            {/* Left Column: Job Details */}
            <Grid item xs={12} md={7}>
              <Paper
                elevation={1}
                sx={{
                  p: { xs: 3, sm: 4 },
                  borderRadius: 3,
                  border: 1,
                  borderColor: 'divider',
                  mb: 3,
                }}
              >
                {/* Job Title & Badges */}
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5 }}>
                  {job.position}
                </Typography>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                  {job.job_code && (
                    <Chip label={`Code: ${job.job_code}`} size="small" variant="outlined" />
                  )}
                  {job.job_type && (
                    <Chip label={job.job_type} size="small" color="primary" variant="filled" />
                  )}
                  {job.work_mode && (
                    <Chip label={job.work_mode} size="small" variant="outlined" />
                  )}
                  {job.notice_period && (
                    <Chip label={`Notice: ${job.notice_period}`} size="small" variant="outlined" />
                  )}
                </Stack>

                {/* Key Overview Cards */}
                <Grid container spacing={2} sx={{ mb: 4 }}>
                  <Grid item xs={12} sm={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <MapPin size={20} color={theme.palette.primary.main} />
                          <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              Location
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {job.location || `${job.city}, ${job.state}` || 'Not Specified'}
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Clock size={20} color={theme.palette.primary.main} />
                          <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              Experience Required
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {job.experience || 'Not Specified'}
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Technical Skills */}
                {job.required_skills && job.required_skills.length > 0 && (
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Award size={18} /> Required Technologies & Skills
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {job.required_skills.map((skill, idx) => (
                        <Chip
                          key={idx}
                          label={skill}
                          size="small"
                          sx={{
                            fontWeight: 500,
                            bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                <Divider sx={{ my: 3 }} />

                {/* Job Description */}
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileText size={18} /> Role Description & Scope
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      lineHeight: 1.8,
                      whiteSpace: 'pre-line',
                      color: 'text.secondary',
                    }}
                  >
                    {job.description || "Please review the required technologies and qualifications above for this position."}
                  </Typography>
                </Box>

                {/* Required Documents */}
                {job.required_documents && (
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      Required Verification Documents Upon Selection:
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                      {job.required_documents}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Right Column: Application Form */}
            <Grid item xs={12} md={5}>
              <Paper
                elevation={2}
                sx={{
                  p: { xs: 3, sm: 4 },
                  borderRadius: 3,
                  border: 1,
                  borderColor: 'divider',
                  position: { md: 'sticky' },
                  top: { md: 90 },
                }}
              >
                {submitSuccess ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Box sx={{ color: 'success.main', mb: 2 }}>
                      <CheckCircle2 size={64} style={{ margin: '0 auto' }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5 }}>
                      Application Submitted!
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
                      Thank you for applying for <strong>{job.position}</strong>. Your candidate profile has been successfully received by our talent acquisition team.
                    </Typography>
                    <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
                      We will review your resume and contact you if your qualifications match the position criteria.
                    </Alert>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => {
                        setSubmitSuccess(false);
                        setFormData({
                          firstName: '',
                          lastName: '',
                          email: '',
                          mobileNumber: '',
                          qualification: '',
                          yearsOfExperience: '',
                          currentCompany: '',
                          currentCtc: '',
                          expectedPay: '',
                          primarySkills: '',
                          city: '',
                          state: '',
                        });
                        setResumeFile(null);
                      }}
                      sx={{ textTransform: 'none' }}
                    >
                      Submit Another Application
                    </Button>
                  </Box>
                ) : (
                  <Box component="form" onSubmit={handleSubmit} noValidate>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Send size={20} color={theme.palette.primary.main} />
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Apply for this Role
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                      Complete your profile details below to submit your application directly to People Prime.
                    </Typography>

                    {submitErrorMessage && (
                      <Alert severity="error" sx={{ mb: 3 }}>
                        {submitErrorMessage}
                      </Alert>
                    )}

                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="First Name"
                          required
                          fullWidth
                          size="small"
                          value={formData.firstName}
                          onChange={(e) => handleInputChange('firstName', e.target.value)}
                          error={Boolean(formErrors.firstName)}
                          helperText={formErrors.firstName}
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Last Name"
                          fullWidth
                          size="small"
                          value={formData.lastName}
                          onChange={(e) => handleInputChange('lastName', e.target.value)}
                          error={Boolean(formErrors.lastName)}
                          helperText={formErrors.lastName}
                        />
                      </Grid>

                      <Grid item xs={12}>
                        <TextField
                          label="Email Address"
                          type="email"
                          required
                          fullWidth
                          size="small"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          error={Boolean(formErrors.email)}
                          helperText={formErrors.email}
                        />
                      </Grid>

                      <Grid item xs={12}>
                        <TextField
                          label="Mobile Number (10 Digits)"
                          required
                          fullWidth
                          size="small"
                          value={formData.mobileNumber}
                          onChange={(e) => handleInputChange('mobileNumber', e.target.value)}
                          error={Boolean(formErrors.mobileNumber)}
                          helperText={formErrors.mobileNumber}
                          placeholder="e.g. 9876543210"
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Qualification"
                          required
                          fullWidth
                          size="small"
                          value={formData.qualification}
                          onChange={(e) => handleInputChange('qualification', e.target.value)}
                          error={Boolean(formErrors.qualification)}
                          helperText={formErrors.qualification}
                          placeholder="e.g. B.Tech, MCA"
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Experience (Years)"
                          required
                          fullWidth
                          size="small"
                          value={formData.yearsOfExperience}
                          onChange={(e) => handleInputChange('yearsOfExperience', e.target.value)}
                          error={Boolean(formErrors.yearsOfExperience)}
                          helperText={formErrors.yearsOfExperience}
                          placeholder="e.g. 5.5"
                        />
                      </Grid>

                      <Grid item xs={12}>
                        <TextField
                          label="Current / Recent Company"
                          required
                          fullWidth
                          size="small"
                          value={formData.currentCompany}
                          onChange={(e) => handleInputChange('currentCompany', e.target.value)}
                          error={Boolean(formErrors.currentCompany)}
                          helperText={formErrors.currentCompany}
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Current CTC (₹ / LPA)"
                          required
                          fullWidth
                          size="small"
                          value={formData.currentCtc}
                          onChange={(e) => handleInputChange('currentCtc', e.target.value)}
                          error={Boolean(formErrors.currentCtc)}
                          helperText={formErrors.currentCtc}
                          placeholder="e.g. 1200000"
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Expected CTC (₹ / LPA)"
                          required
                          fullWidth
                          size="small"
                          value={formData.expectedPay}
                          onChange={(e) => handleInputChange('expectedPay', e.target.value)}
                          error={Boolean(formErrors.expectedPay)}
                          helperText={formErrors.expectedPay}
                          placeholder="e.g. 1500000"
                        />
                      </Grid>

                      <Grid item xs={12}>
                        <TextField
                          label="Key Skills"
                          required
                          fullWidth
                          size="small"
                          value={formData.primarySkills}
                          onChange={(e) => handleInputChange('primarySkills', e.target.value)}
                          error={Boolean(formErrors.primarySkills)}
                          helperText={formErrors.primarySkills}
                          placeholder="e.g. Python, Django, React"
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Current City"
                          required
                          fullWidth
                          size="small"
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          error={Boolean(formErrors.city)}
                          helperText={formErrors.city}
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Current State"
                          required
                          fullWidth
                          size="small"
                          value={formData.state}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          error={Boolean(formErrors.state)}
                          helperText={formErrors.state}
                        />
                      </Grid>

                      {/* Resume File Upload */}
                      <Grid item xs={12}>
                        <Box
                          sx={{
                            border: 2,
                            borderStyle: 'dashed',
                            borderColor: resumeError || formErrors.resume ? 'error.main' : 'divider',
                            borderRadius: 2,
                            p: 2.5,
                            textAlign: 'center',
                            bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                            cursor: 'pointer',
                            '&:hover': {
                              borderColor: 'primary.main',
                            },
                          }}
                          onClick={() => document.getElementById('public-resume-upload')?.click()}
                        >
                          <input
                            type="file"
                            id="public-resume-upload"
                            style={{ display: 'none' }}
                            accept=".pdf,.doc,.docx"
                            onChange={handleFileChange}
                          />
                          <Upload size={28} color={theme.palette.primary.main} style={{ margin: '0 auto 8px' }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {resumeFile ? resumeFile.name : 'Upload Resume Document *'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            PDF, DOC, or DOCX (Maximum file size: 10 MB)
                          </Typography>
                        </Box>
                        {(resumeError || formErrors.resume) && (
                          <Typography variant="caption" sx={{ color: 'error.main', mt: 0.5, display: 'block' }}>
                            {resumeError || formErrors.resume}
                          </Typography>
                        )}
                      </Grid>

                      <Grid item xs={12} sx={{ mt: 1 }}>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          fullWidth
                          size="large"
                          disabled={submitting}
                          startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <Send size={18} />}
                          sx={{ py: 1.3, fontWeight: 700, textTransform: 'none' }}
                        >
                          {submitting ? 'Submitting Application...' : 'Submit Job Application'}
                        </Button>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center', display: 'block' }}>
                          <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                          Your information is submitted securely to People Prime Worldwide Talent Services.
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}
      </Container>
    </Box>
  );
};

export default PublicJobDetails;
