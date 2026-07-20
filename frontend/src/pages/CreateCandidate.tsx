import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  Stack
} from '@mui/material';
import { Upload, ArrowLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { updateApplication, addApplication, addApplicationNote, setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';
import { Application } from '../types';

export const CreateCandidate: React.FC = () => {
  const navigate = useNavigate();
  const { applicationId } = useParams<{ applicationId?: string }>();
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  const [parsedBanner, setParsedBanner] = useState('');

  // Fetch applications if not loaded (e.g. on direct page refresh)
  useEffect(() => {
    if (applications.length === 0) {
      api.get('applications/').then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => { });
    }
  }, [dispatch, applications.length]);

  // Resolve team members if the user is a Team Lead
  const teamMembers = useMemo(() =>
    users.filter(u => {
      const isAssociate = u.role === 'ASSOCIATE_ANALYST' || u.role === 'SENIOR_ANALYST';
      if (!isAssociate) return false;
      
      const isAdminOrCEO = currentUser?.role === 'ADMIN' || currentUser?.role === 'CEO';
      if (isAdminOrCEO) return true;
      
      const reportsToMe = u.reporting_to_list && u.reporting_to_list.some((r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      return reportsToMe;
    }),
    [users, currentUser]
  );

  const myApplications = useMemo(() => {
    if (activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD') {
      return applications.filter(app =>
        app.assigned_employee && teamMembers.some(member => member.email?.toLowerCase() === app.assigned_employee?.email?.toLowerCase())
      );
    }
    return applications.filter(app =>
      app.assigned_employee?.email?.toLowerCase() === currentUser?.email?.toLowerCase()
    );
  }, [applications, activeRole, teamMembers, currentUser]);

  const availableApplications = myApplications.length > 0 ? myApplications : applications;

  const activeRequirements = useMemo(() => {
    return availableApplications.filter(app => !app.candidate_name);
  }, [availableApplications]);

  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Auto-select first requirement if creating candidate without URL ID
  useEffect(() => {
    if (!applicationId && activeRequirements.length > 0 && !selectedApp) {
      setSelectedApp(activeRequirements[0]);
    }
  }, [applicationId, activeRequirements, selectedApp]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    location: '',
    expectedSalary: '',
    noticePeriod: '',
    resumeLink: '',
    skills: '',
    experience: '',
    remarks: '',
    panCard: '',
    aadhaar: '',
    alternateMobileNumber: '',
    source: '',
    interestToWorkForClient: 'Yes', // Default option can be 'Yes'

    // Job Details
    jobCode: '',
    jobTitle: '',
    salary: '',
    startDate: '',
    endDate: '',
    jobStatus: '',
    jobType: '',
    client: '',
    clientJobId: '',
    requiredDocs: '',
    address: '',
    workMode: '',
    employeeType: '',
    zipCode: '',

    // Skills details
    degree: '',
    taxTerms: '',
    manager: '',
    teamLead: '',
    description: '',

    // Cloud document details
    docSource: '',
    fileName: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingCandidateId, setExistingCandidateId] = useState<string | null>(null);

  useEffect(() => {
    const email = formData.email?.trim();
    const phone = formData.phone?.trim();
    if (email && phone) {
      api.get(`applications/check-candidate/?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`)
        .then((res: any) => {
          if (res.data?.exists) {
            const data = res.data;
            setExistingCandidateId(String(data.id));
            setFormData(prev => ({
              ...prev,
              firstName: prev.firstName || data.first_name || '',
              lastName: prev.lastName || data.last_name || '',
              city: prev.city || data.city || '',
              state: prev.state || data.state || '',
              panCard: prev.panCard || data.pan_card || '',
              aadhaar: prev.aadhaar || data.aadhaar || '',
              alternateMobileNumber: prev.alternateMobileNumber || data.alternate_mobile_number || '',
              source: prev.source || data.source || '',
              interestToWorkForClient: prev.interestToWorkForClient || data.interest_to_work_for_client || 'Yes',
              experience: prev.experience || data.experience || '',
              skills: prev.skills || data.technology || '',
              degree: prev.degree || data.degree || '',
              location: prev.location || data.location || '',
              expectedSalary: prev.expectedSalary || data.expected_salary || '',
              noticePeriod: prev.noticePeriod || data.notice_period || '',
              resumeLink: prev.resumeLink || data.resume_link || '',
            }));
          } else {
            setExistingCandidateId(null);
          }
        })
        .catch(() => {
          setExistingCandidateId(null);
        });
    } else {
      setExistingCandidateId(null);
    }
  }, [formData.email, formData.phone]);

  const isDuplicateEmail = useMemo(() => {
    if (!formData.email || !formData.phone) return false;
    const targetApp = applicationId ? (selectedApp || availableApplications.find(a => String(a.id) === applicationId)) : null;
    
    const originalEmail = targetApp?.candidate_email;
    const originalPhone = targetApp?.candidate_phone;

    return applications.some(app => {
      if (targetApp) {
        const matchesOriginalEmail = originalEmail && app.candidate_email?.toLowerCase() === originalEmail.toLowerCase();
        const matchesOriginalPhone = originalPhone && app.candidate_phone && app.candidate_phone.replace(/\D/g, '') === originalPhone.replace(/\D/g, '');
        if (matchesOriginalEmail || matchesOriginalPhone || app.id === targetApp.id) {
          return false;
        }
      }
      return (
        app.candidate_email &&
        app.candidate_email.toLowerCase() === formData.email.toLowerCase() &&
        app.candidate_phone !== formData.phone
      );
    });
  }, [formData.email, formData.phone, applications, selectedApp, applicationId, availableApplications]);

  const isDuplicatePhone = useMemo(() => {
    if (!formData.phone || !formData.email) return false;
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (!cleanPhone) return false;
    const targetApp = applicationId ? (selectedApp || availableApplications.find(a => String(a.id) === applicationId)) : null;
    
    const originalEmail = targetApp?.candidate_email;
    const originalPhone = targetApp?.candidate_phone;

    return applications.some(app => {
      if (targetApp) {
        const matchesOriginalEmail = originalEmail && app.candidate_email?.toLowerCase() === originalEmail.toLowerCase();
        const matchesOriginalPhone = originalPhone && app.candidate_phone && app.candidate_phone.replace(/\D/g, '') === originalPhone.replace(/\D/g, '');
        if (matchesOriginalEmail || matchesOriginalPhone || app.id === targetApp.id) {
          return false;
        }
      }
      if (!app.candidate_phone) return false;
      const appCleanPhone = app.candidate_phone.replace(/\D/g, '');
      return appCleanPhone === cleanPhone && app.candidate_email?.toLowerCase() !== formData.email.toLowerCase();
    });
  }, [formData.phone, formData.email, applications, selectedApp, applicationId, availableApplications]);

  const isDuplicate = isDuplicateEmail || isDuplicatePhone;

  // Helper to extract metadata from remarks
  const extractFieldFromRemarks = (remarks: string, fieldName: string): string => {
    const regex = new RegExp(`${fieldName}:\\s*(.*)`);
    const match = remarks.match(regex);
    return match ? match[1].trim() : '';
  };



  /** Pre-fill ALL fields including candidate info (used when editing an existing application) */
  const populateFormForApp = (app: Application) => {
    const remarks = app.remarks || '';
    const extractField = (fieldName: string) => extractFieldFromRemarks(remarks, fieldName);

    const nameParts = (app.candidate_name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return {
      firstName,
      lastName,
      email: app.candidate_email || '',
      phone: app.candidate_phone || '',
      city: app.city || '',
      state: app.state || '',
      location: extractField('Location') || '',
      expectedSalary: extractField('Salary') || '',
      noticePeriod: extractField('Notice Period') || 'Immediate',
      resumeLink: extractField('Resume Link') || '',
      skills: app.technology || '',
      experience: String(app.experience) || '',
      remarks: '',
      panCard: app.pan_card || '',
      aadhaar: app.aadhaar || '',
      alternateMobileNumber: app.alternate_mobile_number || '',
      source: app.source || '',
      interestToWorkForClient: app.interest_to_work_for_client || 'Yes',

      // Job Details
      jobCode: extractField('Job Code') || `PPW-${Math.floor(1000 + Math.random() * 9000)}`,
      jobTitle: app.position || '',
      salary: extractField('Salary') || '',
      startDate: extractField('Start Date') || new Date().toISOString().split('T')[0],
      endDate: extractField('End Date') || '',
      jobStatus: extractField('Job Status') || 'Active',
      jobType: extractField('Job Type') || 'Full-time',
      client: app.client_name || '',
      clientJobId: extractField('Client Job ID') || '',
      requiredDocs: extractField('Required Documents') || 'Resume, ID Proof',
      address: extractField('Address') || '',
      workMode: extractField('Work Mode') || 'On-site',
      employeeType: extractField('Employee Type') || 'W2',
      zipCode: extractField('Zip Code') || '',

      // Skills
      degree: extractField('Degree') || 'Bachelors Degree',
      taxTerms: extractField('Tax Terms') || 'C2C',
      manager: extractField('Manager') || '',
      teamLead: extractField('Team Lead') || app.assigned_employee?.full_name || '',
      description: extractField('Description') || '',

      docSource: 'PC',
      fileName: ''
    };
  };

  // Pre-fill fields only if editing a specific application ID
  useEffect(() => {
    if (applicationId) {
      const app = applications.find(a => String(a.id) === applicationId);
      if (app) {
        setSelectedApp(app);
        const prefilled = populateFormForApp(app);
        setFormData(prev => ({
          ...prev,
          ...prefilled
        }));
      }
    }
  }, [applicationId, applications]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const targetApp = applicationId ? (selectedApp || availableApplications.find(a => String(a.id) === applicationId)) : null;

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.city || !formData.state || !formData.degree || !formData.source) {
      setError('Please fill in all candidate contact details, city, state, qualification, and source.');
      return;
    }

    if (!selectedFile && !formData.resumeLink) {
      setError('Please attach a resume/document. This field is mandatory.');
      return;
    }

    // Only block on duplicate email/phone when this is NOT a known existing candidate being re-submitted
    if (!existingCandidateId) {
      if (isDuplicateEmail) {
        setError('A candidate with this email address already exists in the system. Duplicate candidate profiles are not allowed.');
        return;
      }

      if (isDuplicatePhone) {
        setError('A candidate with this phone number already exists in the system. Duplicate candidate profiles are not allowed.');
        return;
      }
    }

    if (formData.expectedSalary.replace(/\D/g, '').length <= 4) {
      setError('Expected Salary / Rate must be more than 4 digits.');
      return;
    }

    if (selectedFile && selectedFile.size > 1048576) {
      setError('Resume size must be within 1 MB.');
      return;
    }

    setSubmitting(true);
    try {
      let finalResumeLink = formData.resumeLink || 'N/A';
      if (selectedFile) {
        const uploadForm = new FormData();
        uploadForm.append('file', selectedFile);
        const uploadRes = await api.post('applications/upload-resume/', uploadForm, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        finalResumeLink = uploadRes.data.url;
      }

      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const formattedRemarks = `[Candidate Details]
Location: ${formData.location}
Expected Salary: ${formData.expectedSalary}
Notice Period: ${formData.noticePeriod}
Resume Link: ${finalResumeLink}
Skills: ${formData.skills}
--------------------------
[Job Details Update]
Job Code: ${formData.jobCode}
Job Title: ${formData.jobTitle}
Salary: ${formData.salary}
Start Date: ${formData.startDate}
End Date: ${formData.endDate || 'N/A'}
Location: ${formData.location}
Job Status: ${formData.jobStatus}
Job Type: ${formData.jobType}
Client Job ID: ${formData.clientJobId}
Required Documents: ${formData.requiredDocs}
Address: ${formData.address}
Work Mode: ${formData.workMode}
Employee Type: ${formData.employeeType}
Zip Code: ${formData.zipCode}

[Skills details]
Degree: ${formData.degree}
Tax Terms: ${formData.taxTerms}
Manager: ${formData.manager || 'N/A'}
Team Lead: ${formData.teamLead}
Description: ${formData.description}

[Document Attachment]
Source Option: ${formData.docSource}
FileName: ${formData.fileName || 'No document uploaded'}

--------------------------
Recruiter Remarks: ${formData.remarks}`;

      const payload: any = {
        candidate_name: fullName,
        candidate_email: formData.email,
        candidate_phone: formData.phone,
        city: formData.city,
        state: formData.state,
        client_name: targetApp ? targetApp.client_name : (formData.client || 'N/A'),
        position: targetApp ? targetApp.position : (formData.jobTitle || 'N/A'),
        experience: parseFloat(formData.experience) || (targetApp ? targetApp.experience : 0),
        technology: formData.skills || (targetApp ? targetApp.technology : 'N/A'),
        recruiter: currentUser?.full_name || '',
        remarks: formattedRemarks,
        status: (targetApp || (formData.client && formData.client !== 'N/A' && formData.jobTitle && formData.jobTitle !== 'N/A')) ? 'Submitted' : 'New',
        assigned_employee_id: targetApp ? (targetApp.assigned_employee?.email || null) : (currentUser?.email || null),
        pan_card: formData.panCard,
        aadhaar: formData.aadhaar,
        alternate_mobile_number: formData.alternateMobileNumber,
        source: formData.source,
        interest_to_work_for_client: formData.interestToWorkForClient
      };

      let res;
      let isNewRecord = false;
      try {
        if (applicationId && targetApp && targetApp.id) {
          // We are explicitly updating a requirement or candidate in place
          res = await api.put(`applications/${applicationId}/`, payload);
        } else if (existingCandidateId) {
          // Reuse the existing candidate record globally by updating it in place
          res = await api.put(`applications/${existingCandidateId}/`, payload);
        } else {
          // We are creating a standalone candidate - POST a new record
          res = await api.post('applications/', payload);
          isNewRecord = true;
        }
      } catch (err: any) {
        // Fallback 1: If we get a 404 (No Application matches the given query) because the existing
        // application belongs to another recruiter/is out of the user's scope, create a new record instead.
        // Fallback 2: If server says "already assigned" but this is a multi-associate re-submission
        // of an existing candidate, silently create a new record for this associate's slot.
        const isAlreadyAssigned = err?.response?.status === 400 &&
          JSON.stringify(err?.response?.data || '').toLowerCase().includes('already assigned');
        if (err?.response?.status === 404 && (existingCandidateId || applicationId)) {
          res = await api.post('applications/', payload);
          isNewRecord = true;
        } else if (isAlreadyAssigned && existingCandidateId) {
          res = await api.post('applications/', payload);
          isNewRecord = true;
        } else {
          throw err;
        }
      }

      await api.post(`applications/${res.data.id}/add-note/`, {
        content: `Candidate Sourced: Sourced ${fullName} and submitted application for review.`
      });

      if (isNewRecord) {
        dispatch(addApplication(res.data));
      } else {
        dispatch(updateApplication(res.data));
      }

      dispatch(addApplicationNote({
        id: `note_log_${Date.now()}`,
        application_id: res.data.id,
        author: {
          id: currentUser?.id || 'sys',
          full_name: currentUser?.full_name || 'System',
          role: activeRole
        },
        content: `Candidate Sourced: Sourced ${fullName} and submitted application for review.`,
        created_at: new Date().toISOString()
      }));

      setSuccess(`✅ Candidate "${fullName}" submitted successfully!`);
      setTimeout(() => navigate('/'), 1800);
    } catch (err: any) {
      console.error("Submission error details:", err);
      if (err.response?.status === 413) {
        setError('Resume size must be within 1 MB.');
        return;
      }
      const serverError = err.response?.data;
      let errMsg = "Failed to submit candidate to the database.";
      if (serverError) {
        if (typeof serverError === 'object') {
          errMsg = Object.entries(serverError)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
        } else {
          errMsg = String(serverError);
        }
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(`Failed to submit candidate: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  }; return (
    <Box sx={{ maxWidth: 900, mx: 'auto', pb: 6 }}>
      {/* Header back button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Button
          onClick={() => navigate('/')}
          startIcon={<ArrowLeft size={16} />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Back to Dashboard
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Add Candidate Details
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Provide details under Candidate Info, Job Details, Skills, and Cloud Upload options.
          </Typography>
        </Box>
      </Box>

      {parsedBanner && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: '8px', fontWeight: 700 }} onClose={() => setParsedBanner('')}>
          ✨ {parsedBanner}
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }}>{success}</Alert>}

      <Card sx={{ borderRadius: '16px', boxShadow: theme.shadows[3] }}>
        <CardContent sx={{ p: 4 }}>
          <form onSubmit={handleSubmit}>


            {/* SECTION 1: CANDIDATE INFO */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              👤 Candidate Contact Information
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="First Name"
                  required
                  fullWidth
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Last Name"
                  required
                  fullWidth
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email Address"
                  required
                  type="email"
                  fullWidth
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Phone Number"
                  required
                  fullWidth
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 019-9234"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="City"
                  required
                  fullWidth
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="State"
                  required
                  fullWidth
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="PAN Card"
                  fullWidth
                  value={formData.panCard}
                  onChange={(e) => setFormData({ ...formData, panCard: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Aadhaar"
                  fullWidth
                  value={formData.aadhaar}
                  onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Alternate Mobile Number"
                  fullWidth
                  value={formData.alternateMobileNumber}
                  onChange={(e) => setFormData({ ...formData, alternateMobileNumber: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Source"
                  required
                  fullWidth
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Interest to Work for Client</InputLabel>
                  <Select
                    value={formData.interestToWorkForClient}
                    label="Interest to Work for Client"
                    onChange={(e) => setFormData({ ...formData, interestToWorkForClient: e.target.value })}
                  >
                    <MenuItem value="Yes">Yes</MenuItem>
                    <MenuItem value="No">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {isDuplicate && (
              <Alert severity="error" sx={{ mb: 3, mt: 1, borderRadius: '8px', fontWeight: 700 }}>
                ⚠️ Duplicate Candidate Detected: A candidate with this Email/Phone already exists in our database. Duplicate profiles are blocked.
              </Alert>
            )}

            <Box sx={{ opacity: isDuplicate ? 0.45 : 1, pointerEvents: isDuplicate ? 'none' : 'auto', transition: 'opacity 0.25s' }}>


              {/* SECTION 3: SKILLS */}
              <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                🛠️ Skills
              </Typography>
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Qualification"
                    required
                    fullWidth
                    value={formData.degree}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Years of Experience"
                    required
                    fullWidth
                    type="number"
                    inputProps={{ step: '0.5', min: '0' }}
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Primary Skills / Tech Stack"
                    required
                    fullWidth
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    size="small"
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              {/* SECTION 4: NOTICE PERIOD */}
              <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                🕒 Notice Period
              </Typography>
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small" required>
                    <InputLabel>Notice Period</InputLabel>
                    <Select
                      value={formData.noticePeriod}
                      label="Notice Period"
                      onChange={(e) => setFormData({ ...formData, noticePeriod: e.target.value })}
                    >
                      <MenuItem value="Immediate">Immediate / Serving Notice</MenuItem>
                      <MenuItem value="1 Week">1 Week</MenuItem>
                      <MenuItem value="2 Weeks">2 Weeks</MenuItem>
                      <MenuItem value="30 Days">30 Days</MenuItem>
                      <MenuItem value="60 Days">60 Days</MenuItem>
                      <MenuItem value="90 Days">90 Days</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Expected Salary / Rate"
                    required
                    fullWidth
                    value={formData.expectedSalary}
                    onChange={(e) => setFormData({ ...formData, expectedSalary: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 110000"
                    size="small"
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              {/* SECTION 5: DOCUMENT UPLOAD */}
              <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                📎 Document Upload Options
              </Typography>
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<Upload size={16} />}
                      sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                      Attach Resume / Documents *
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                            setFormData(prev => ({ ...prev, fileName: file.name }));
                          }
                        }}
                      />
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                      {formData.fileName || 'No file attached'}
                    </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} sx={{ mt: 1 }}>
                  <TextField
                    label="Additional Recruiter Evaluation Notes"
                    fullWidth
                    multiline
                    rows={3}
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    placeholder="Notes about candidate screening, references, availability, etc."
                    size="small"
                  />
                </Grid>
              </Grid>

            </Box>

            {/* Actions */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
                sx={{ px: 4, borderRadius: '8px' }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="success"
                sx={{ px: 5, borderRadius: '8px', fontWeight: 700 }}
                disabled={submitting || availableApplications.length === 0 || isDuplicate}
              >
                {submitting ? 'Submitting...' : 'Submit Candidate Profile'}
              </Button>
            </Box>

          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
