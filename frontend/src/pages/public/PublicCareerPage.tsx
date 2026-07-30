import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Chip,
  Stack,
  Divider,
  Paper,
  IconButton,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import {
  Briefcase,
  MapPin,
  Clock,
  Search,
  Building,
  ArrowRight,
  ArrowLeft,
  Award,
  Sun,
  Moon,
  FileCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { ATSApplicationForm } from '../../components/public/ATSApplicationForm';

export interface PublicJob {
  id: number;
  job_code?: string | null;
  position: string;
  technology: string;
  required_skills?: string[];
  experience?: string | null;
  city?: string;
  state?: string;
  location?: string | null;
  job_type?: string | null;
  work_mode?: string | null;
  notice_period?: string | null;
  description?: string | null;
  required_documents?: string | null;
  published_at?: string | null;
  created_at: string;
}

interface PublicCareerPageProps {
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
}

export const PublicCareerPage: React.FC<PublicCareerPageProps> = ({ themeMode, toggleTheme }) => {
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [activeView, setActiveView] = useState<'LIST' | 'DETAILS' | 'APPLY'>('LIST');

  useEffect(() => {
    fetchPublicJobs();
  }, []);

  const fetchPublicJobs = async () => {
    setLoading(true);
    try {
      const res = await api.get('public/jobs/');
      const list = res.data?.results ?? res.data ?? [];
      setJobs(list);
    } catch (err) {
      console.error('Failed to load public jobs', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const posMatch = job.position?.toLowerCase().includes(query);
    const techMatch = job.technology?.toLowerCase().includes(query);
    const locMatch = (job.location || `${job.city} ${job.state}`)?.toLowerCase().includes(query);
    const codeMatch = job.job_code?.toLowerCase().includes(query);
    return posMatch || techMatch || locMatch || codeMatch;
  });

  const handleOpenDetails = (job: PublicJob) => {
    setSelectedJob(job);
    setActiveView('DETAILS');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenApply = (job: PublicJob) => {
    setSelectedJob(job);
    setActiveView('APPLY');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', pb: 8 }}>
      {/* Career Portal Header Navigation Bar */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
          py: 2,
          px: { xs: 2, md: 4 },
          sticky: 'top',
          top: 0,
          zIndex: 1100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }} onClick={() => setActiveView('LIST')}>
              <Building size={28} color="#3b82f6" />
              <Box>
                <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.1 }}>
                  People Prime Worldwide
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Official Careers Portal
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={2} alignItems="center">
              <IconButton onClick={toggleTheme} color="inherit" size="small">
                {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </IconButton>
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* Main Content Area */}
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* VIEW 1: JOB LISTINGS */}
        {activeView === 'LIST' && (
          <Box>
            {/* Banner */}
            <Paper
              elevation={0}
              sx={{
                p: { xs: 3, md: 5 },
                mb: 4,
                borderRadius: '20px',
                background: themeMode === 'dark'
                  ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
                  : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: theme => `1px solid ${theme.palette.divider}`
              }}
            >
              <Typography variant="h3" fontWeight={850} color="text.primary" gutterBottom sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' } }}>
                Find Your Next Career Opportunity
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 650, mb: 3 }}>
                Explore open positions at People Prime Worldwide and partner clients. Build your career with top tech innovators.
              </Typography>

              {/* Search input */}
              <TextField
                fullWidth
                placeholder="Search by Job Title, Skill (e.g. React, Java), or Location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={20} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: 'background.paper',
                    borderRadius: '12px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
                  }
                }}
              />
            </Paper>

            {/* Jobs Header Count */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" fontWeight={800}>
                Open Job Openings ({filteredJobs.length})
              </Typography>
            </Box>

            {/* Loading Indicator */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={40} />
              </Box>
            ) : filteredJobs.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: '16px' }}>
                <Briefcase size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
                <Typography variant="h6" fontWeight={700}>
                  No active job postings found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {searchQuery ? 'Try adjusting your search keywords.' : 'Check back later for new career opportunities.'}
                </Typography>
              </Paper>
            ) : (
              <Grid container spacing={3}>
                {filteredJobs.map((job) => (
                  <Grid item xs={12} md={6} key={job.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: '16px',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                          borderColor: 'primary.main'
                        }
                      }}
                    >
                      <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                          <Typography variant="h6" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.3 }}>
                            {job.position}
                          </Typography>
                          {job.job_code && (
                            <Chip
                              label={job.job_code}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                            />
                          )}
                        </Box>

                        <Stack spacing={1} sx={{ mb: 2.5 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, fontWeight: 600 }}>
                            <MapPin size={16} /> {job.location || [job.city, job.state].filter(Boolean).join(', ') || 'Remote'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, fontWeight: 600 }}>
                            <Award size={16} /> Experience: {job.experience || 'N/A'}
                          </Typography>
                          {job.work_mode && (
                            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, fontWeight: 600 }}>
                              <Clock size={16} /> Mode: {job.work_mode} {job.job_type ? `(${job.job_type})` : ''}
                            </Typography>
                          )}
                        </Stack>

                        {/* Technology chips */}
                        {job.technology && (
                          <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 2 }}>
                            {job.technology.split(',').map((tech, idx) => (
                              <Chip
                                key={idx}
                                label={tech.trim()}
                                size="small"
                                sx={{ borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}
                              />
                            ))}
                          </Box>
                        )}
                      </CardContent>

                      <Divider />

                      <Box sx={{ p: 2, px: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'action.hover' }}>
                        <Button
                          size="small"
                          onClick={() => handleOpenDetails(job)}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => handleOpenApply(job)}
                          endIcon={<ArrowRight size={16} />}
                          sx={{ borderRadius: '8px', px: 2.5, fontWeight: 750, textTransform: 'none' }}
                        >
                          Apply Now
                        </Button>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* VIEW 2: JOB DETAILS */}
        {activeView === 'DETAILS' && selectedJob && (
          <Box sx={{ maxWidth: 850, mx: 'auto' }}>
            <Button
              onClick={() => setActiveView('LIST')}
              startIcon={<ArrowLeft size={16} />}
              sx={{ mb: 2.5, borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
            >
              Back to Job Openings
            </Button>

            <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: '16px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Box>
                  <Typography variant="h4" fontWeight={850} color="text.primary" gutterBottom>
                    {selectedJob.position}
                  </Typography>
                  {selectedJob.job_code && (
                    <Typography variant="subtitle2" color="primary.main" fontWeight={700}>
                      Job Code: {selectedJob.job_code}
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={() => handleOpenApply(selectedJob)}
                  endIcon={<ArrowRight size={18} />}
                  sx={{ borderRadius: '10px', px: 4, py: 1.2, fontWeight: 800, textTransform: 'none' }}
                >
                  Apply Now
                </Button>
              </Box>

              <Divider sx={{ mb: 3 }} />

              {/* Key Highlights Grid */}
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      LOCATION
                    </Typography>
                    <Typography variant="body2" fontWeight={800} sx={{ mt: 0.5 }}>
                      {selectedJob.location || [selectedJob.city, selectedJob.state].filter(Boolean).join(', ') || 'N/A'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      EXPERIENCE
                    </Typography>
                    <Typography variant="body2" fontWeight={800} sx={{ mt: 0.5 }}>
                      {selectedJob.experience || 'N/A'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      WORK MODE
                    </Typography>
                    <Typography variant="body2" fontWeight={800} sx={{ mt: 0.5 }}>
                      {selectedJob.work_mode || 'N/A'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      NOTICE PERIOD
                    </Typography>
                    <Typography variant="body2" fontWeight={800} sx={{ mt: 0.5 }}>
                      {selectedJob.notice_period || 'N/A'}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Required Skills Section */}
              {selectedJob.required_skills && selectedJob.required_skills.length > 0 && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Required Technical Skills
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                    {selectedJob.required_skills.map((skill, idx) => (
                      <Chip
                        key={idx}
                        label={skill}
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 700, borderRadius: '8px' }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Description Section */}
              {selectedJob.description && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                    Job Description & Responsibilities
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{
                      whiteSpace: 'pre-line',
                      lineHeight: 1.7,
                      fontSize: '0.95rem'
                    }}
                  >
                    {selectedJob.description}
                  </Typography>
                </Box>
              )}

              {/* Required Documents Section */}
              {selectedJob.required_documents && (
                <Box sx={{ mb: 4, p: 2, borderRadius: '12px', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <FileCheck size={20} color="#3b82f6" />
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      REQUIRED DOCUMENTS FOR APPLICATION
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {selectedJob.required_documents}
                    </Typography>
                  </Box>
                </Box>
              )}

              <Box sx={{ pt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={() => handleOpenApply(selectedJob)}
                  endIcon={<ArrowRight size={18} />}
                  sx={{ borderRadius: '10px', px: 4, py: 1.2, fontWeight: 800, textTransform: 'none' }}
                >
                  Apply for this Position
                </Button>
              </Box>
            </Paper>
          </Box>
        )}

        {/* VIEW 3: APPLY FORM */}
        {activeView === 'APPLY' && selectedJob && (
          <ATSApplicationForm
            jobId={selectedJob.id}
            jobPosition={selectedJob.position}
            jobCode={selectedJob.job_code || undefined}
            onCancel={() => setActiveView('DETAILS')}
            onSuccessBackToJobs={() => {
              setActiveView('LIST');
              setSelectedJob(null);
            }}
          />
        )}
      </Container>
    </Box>
  );
};
