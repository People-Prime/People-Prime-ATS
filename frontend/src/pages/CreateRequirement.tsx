import React, { useState, useEffect } from 'react';
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
  Stack,
  Checkbox,
  ListItemText
} from '@mui/material';
import { Upload } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { addApplication, updateApplication, deleteApplication } from '../redux/applicationsSlice';
import { api } from '../services/api';

export const CreateRequirement: React.FC = () => {
  const navigate = useNavigate();
  const { applicationId } = useParams<{ applicationId?: string }>();
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications);

  // Form states
  const [formData, setFormData] = useState({
    // Job Details
    jobCode: '',
    jobTitle: '',
    clientBillRate: '',
    payRate: '',
    startDate: '',
    endDate: '',
    location: '',
    jobStatus: '',
    jobType: '',
    client: '',
    clientJobId: '',
    requiredDocs: '',
    address: '',
    workMode: '',
    employeeType: '',
    zipCode: '',

    // Skills
    degree: '',
    experience: '',
    primarySkills: '',
    description: '',

    // Notice Period
    noticePeriod: '',

    // Document options
    docSource: '',
    fileName: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resolve team members (Associate Analysts / Senior Analysts)
  const teamMembers = users.filter(u => {
    const isAssociate = u.role === 'ASSOCIATE_ANALYST' || u.role === 'SENIOR_ANALYST';
    if (!isAssociate) return false;
    
    const isAdminOrCEO = currentUser?.role === 'ADMIN' || currentUser?.role === 'CEO';
    if (isAdminOrCEO) return true;
    
    const reportsToMe = u.reporting_to_list && u.reporting_to_list.some((r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    return reportsToMe;
  });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!applicationId && teamMembers.length > 0 && assigneeIds.length === 0) {
      setAssigneeIds([teamMembers[0].email || teamMembers[0].id]);
    }
  }, [teamMembers, assigneeIds, applicationId]);

  useEffect(() => {
    if (!applicationId) {
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        jobCode: 'PPW - [Auto Generated]',
        startDate: today,
        endDate: today
      }));
    }
  }, [applicationId, currentUser, navigate]);

  useEffect(() => {
    if (applicationId && applications.length > 0) {
      const app = applications.find(a => String(a.id) === applicationId);
      if (app) {
        const remarks = app.remarks || '';
        const extractField = (fieldName: string): string => {
          const regex = new RegExp(`${fieldName}:\\s*(.*)`);
          const match = remarks.match(regex);
          return match ? match[1].trim() : '';
        };

        const jobCode = extractField('Job Code') || `PPW - ${String(app.id).padStart(4, '0')}`;
        
        // Find all applications with the same Job Code to get assigneeIds
        const groupApps = applications.filter(a => {
          const aRemarks = a.remarks || '';
          const aMatch = aRemarks.match(/Job Code:\s*(.+)/);
          const aCode = aMatch ? aMatch[1].trim() : '';
          return aCode === jobCode && !a.candidate_name;
        });

        const emails = groupApps
          .map(a => a.assigned_employee?.email)
          .filter(Boolean) as string[];

        setAssigneeIds(emails);

        setFormData({
          jobCode: jobCode,
          jobTitle: app.position || '',
          clientBillRate: extractField('Client Bill Rate') || '',
          payRate: extractField('Pay Rate') || '',
          startDate: extractField('Start Date') || new Date().toISOString().split('T')[0],
          endDate: extractField('End Date') === 'N/A' ? '' : extractField('End Date'),
          location: extractField('Location') || '',
          jobStatus: extractField('Job Status') || 'Active',
          jobType: extractField('Job Type') || 'Full-time',
          client: app.client_name || '',
          clientJobId: extractField('Client Job ID') || '',
          requiredDocs: extractField('Required Documents') || 'Resume, ID Proof',
          address: extractField('Address') || '',
          workMode: extractField('Work Mode') || 'On-site',
          employeeType: extractField('Employee Type') || 'W2',
          zipCode: extractField('Zip Code') || '',
          degree: extractField('Degree') || 'Bachelors Degree',
          experience: String(app.experience) || '3',
          primarySkills: app.technology || '',
          description: extractField('Description') || '',
          noticePeriod: extractField('Notice Period') || 'Immediate',
          docSource: extractField('Source Option') || 'PC',
          fileName: extractField('FileName') === 'No document uploaded' ? '' : extractField('FileName')
        });
      }
    }
  }, [applicationId, applications]);

  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.client || !formData.jobTitle || !formData.primarySkills || !formData.experience || !formData.location || !formData.jobStatus || !formData.clientBillRate || !formData.payRate || !formData.jobType || !formData.description) {
      setError('Please fill in all required fields (Client, Job Title, Primary Skills, Experience, Location, Job Status, Client Bill Rate, Pay Rate, Job Type, Detailed Job Description).');
      return;
    }

    if (formData.description.trim().length < 100) {
      setError('Job description is less than 100 characters.');
      return;
    }

    if (formData.clientBillRate.replace(/\D/g, '').length <= 4) {
      setError('Client Bill Rate must be more than 4 digits.');
      return;
    }

    if (formData.payRate.replace(/\D/g, '').length <= 4) {
      setError('Pay Rate / Salary must be more than 4 digits.');
      return;
    }

    setSubmitting(true);
    try {
      if (assigneeIds.length === 0) {
        setError('Please select at least one assignee.');
        setSubmitting(false);
        return;
      }

      if (applicationId) {
        // Edit mode!
        const app = applications.find(a => String(a.id) === applicationId);
        const oldJobCode = app ? (app.remarks.match(/Job Code:\s*(.+)/)?.[1]?.trim() || '') : '';
        const groupApps = applications.filter(a => {
          const aRemarks = a.remarks || '';
          const aMatch = aRemarks.match(/Job Code:\s*(.+)/);
          const aCode = aMatch ? aMatch[1].trim() : '';
          return aCode === oldJobCode && !a.candidate_name;
        });

        const formattedRemarks = `[Job Details]
Job Code: ${formData.jobCode}
Client Bill Rate: ${formData.clientBillRate}
Pay Rate: ${formData.payRate}
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

[Skills & Assignment]
Degree: ${formData.degree}
Description: ${formData.description}

[Notice Period]
Notice Period: ${formData.noticePeriod}

[Document Attachment]
Source Option: ${formData.docSource}
FileName: ${formData.fileName || 'No document uploaded'}`;

        for (const email of assigneeIds) {
          const existing = groupApps.find(a => a.assigned_employee?.email === email);
          const payload = {
            client_name: formData.client,
            position: formData.jobTitle,
            technology: formData.primarySkills,
            experience: parseFloat(formData.experience) || 0.0,
            assigned_employee_id: email,
            remarks: formattedRemarks
          };

          if (existing) {
            const res = await api.put(`applications/${existing.id}/`, payload);
            dispatch(updateApplication(res.data));
          } else {
            const res = await api.post('applications/', payload);
            dispatch(addApplication(res.data));
          }
        }

        const deselected = groupApps.filter(a => !assigneeIds.includes(a.assigned_employee?.email || ''));
        for (const desApp of deselected) {
          await api.delete(`applications/${desApp.id}/`);
          dispatch(deleteApplication(String(desApp.id)));
        }

        setSuccess(`✅ Job requirement for "${formData.jobTitle}" updated successfully!`);
        setTimeout(() => navigate('/job-postings'), 1800);

      } else {
        // Create mode!
        let generatedJobCode = '';
        for (const id of assigneeIds) {
          const assignedUser = users.find(u => u.id === id || u.email === id);
          const finalJobCode = generatedJobCode || formData.jobCode;

          const formattedRemarks = `[Job Details]
Job Code: ${finalJobCode}
Client Bill Rate: ${formData.clientBillRate}
Pay Rate: ${formData.payRate}
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

[Skills & Assignment]
Degree: ${formData.degree}
Description: ${formData.description}

[Notice Period]
Notice Period: ${formData.noticePeriod}

[Document Attachment]
Source Option: ${formData.docSource}
FileName: ${formData.fileName || 'No document uploaded'}`;

          const payload = {
            client_name: formData.client,
            position: formData.jobTitle,
            technology: formData.primarySkills,
            experience: parseFloat(formData.experience) || 0.0,
            assigned_employee_id: assignedUser ? assignedUser.email : null,
            remarks: formattedRemarks
          };

          const response = await api.post('applications/', payload);
          const returnedRemarks = response.data.remarks || '';
          const match = returnedRemarks.match(/Job Code:\s*(.+)/);
          if (match && !generatedJobCode) {
            generatedJobCode = match[1].trim();
          }
          dispatch(addApplication(response.data));
        }

        setSuccess(`✅ Job requirement for "${formData.jobTitle}" created and assigned successfully!`);
        setTimeout(() => navigate('/'), 1800);
      }
    } catch (err: any) {
      const data = err.response?.data;
      let detail = 'Failed to create job requirement. Please try again.';
      if (data) {
        detail = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
      }
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {applicationId ? 'Edit Job Posting' : 'Create New Job Requirement'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {applicationId ? 'Modify details under Job Details, Skills, Notice Period, and Document Options.' : 'Provide details under Job Details, Skills, Notice Period, and Document Options.'}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }}>{success}</Alert>}

      <Card sx={{ borderRadius: '16px', boxShadow: theme.shadows[3] }}>
        <CardContent sx={{ p: 4 }}>
          <form onSubmit={handleSaveRequirement}>
            <Alert severity="info" sx={{ mb: 3.5, borderRadius: '8px', fontWeight: 600 }}>
              ℹ️ Note: This job opening is set to become inactive by the end of today.
            </Alert>

            {/* SECTION 1: JOB DETAILS */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              💼 Job Details
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Job Code"
                  fullWidth
                  disabled
                  value={formData.jobCode}
                  onChange={(e) => setFormData({ ...formData, jobCode: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Job Title"
                  required
                  fullWidth
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  placeholder="e.g. Lead SRE / Recruiter Manager"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Client Bill Rate"
                  required
                  fullWidth
                  value={formData.clientBillRate}
                  onChange={(e) => setFormData({ ...formData, clientBillRate: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 80"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Pay Rate / Salary"
                  required
                  fullWidth
                  value={formData.payRate}
                  onChange={(e) => setFormData({ ...formData, payRate: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 60"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Job Start Date"
                  type="date"
                  disabled={!applicationId || currentUser?.role === 'TEAM_LEAD' || currentUser?.role === 'SUB_LEAD'}
                  fullWidth
                  inputProps={{ max: new Date().toISOString().split('T')[0] }}
                  value={formData.startDate}
                  onChange={(e) => {
                    let val = e.target.value;
                    const today = new Date().toISOString().split('T')[0];
                    if (val && val > today) {
                      val = today;
                    }
                    setFormData(prev => ({ ...prev, startDate: val, endDate: val }));
                  }}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Job End Date"
                  type="date"
                  disabled
                  fullWidth
                  value={formData.endDate}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  helperText="Automatically matches Start Date"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Location"
                  required
                  fullWidth
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Dallas, TX"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small" required>
                  <InputLabel>Job Status</InputLabel>
                  <Select
                    value={formData.jobStatus}
                    label="Job Status *"
                    required
                    onChange={(e) => setFormData({ ...formData, jobStatus: e.target.value })}
                  >
                    <MenuItem value="Active">Active</MenuItem>
                    <MenuItem value="On Hold">On Hold</MenuItem>
                    <MenuItem value="Closed">Closed</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small" required>
                  <InputLabel>Job Type *</InputLabel>
                  <Select
                    value={formData.jobType}
                    label="Job Type *"
                    required
                    onChange={(e) => setFormData({ ...formData, jobType: e.target.value })}
                  >
                    <MenuItem value="Full-time">Full-time</MenuItem>
                    <MenuItem value="Contract">Contract</MenuItem>
                    <MenuItem value="Part-time">Part-time</MenuItem>
                    <MenuItem value="Internship">Internship</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Client Name"
                  required
                  fullWidth
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  placeholder="e.g. J.P. Morgan"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Client Job ID"
                  fullWidth
                  value={formData.clientJobId}
                  onChange={(e) => setFormData({ ...formData, clientJobId: e.target.value })}
                  placeholder="e.g. JPM-9901-A"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Required Documents"
                  fullWidth
                  value={formData.requiredDocs}
                  onChange={(e) => setFormData({ ...formData, requiredDocs: e.target.value })}
                  placeholder="e.g. Resume, Visa Copy, DL"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Work Mode</InputLabel>
                  <Select
                    value={formData.workMode}
                    label="Work Mode"
                    onChange={(e) => setFormData({ ...formData, workMode: e.target.value })}
                  >
                    <MenuItem value="On-site">On-site</MenuItem>
                    <MenuItem value="Hybrid">Hybrid</MenuItem>
                    <MenuItem value="Remote">Remote</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Full Work Address"
                  fullWidth
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 500 Park Ave, New York, NY"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Zip Code"
                  fullWidth
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  placeholder="e.g. 10022"
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Detailed Job Description"
                  required
                  fullWidth
                  multiline
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Paste roles, responsibilities, project details, and required qualifications..."
                  size="small"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* SECTION 2: SKILLS */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              🛠️ Skills
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Degree / Education Requirements"
                  fullWidth
                  value={formData.degree}
                  onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Experience Required (Years)"
                  required
                  fullWidth
                  type="number"
                  inputProps={{ step: '0.5', min: '0' }}
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Primary Skills / Technology Stack"
                  required
                  fullWidth
                  value={formData.primarySkills}
                  onChange={(e) => setFormData({ ...formData, primarySkills: e.target.value })}
                  placeholder="e.g. Java, Spring Boot, React, AWS"
                  size="small"
                />
              </Grid>


            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* SECTION 3: NOTICE PERIOD & RECRUITER ASSIGNMENT */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              🕒 Notice Period & Assignment
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Notice Period Allowed</InputLabel>
                  <Select
                    value={formData.noticePeriod}
                    label="Notice Period Allowed"
                    onChange={(e) => setFormData({ ...formData, noticePeriod: e.target.value })}
                  >
                    <MenuItem value="Immediate">Immediate / serving notice</MenuItem>
                    <MenuItem value="1 Week">1 Week</MenuItem>
                    <MenuItem value="2 Weeks">2 Weeks</MenuItem>
                    <MenuItem value="30 Days">30 Days</MenuItem>
                    <MenuItem value="60 Days">60 Days</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" required>
                  <InputLabel>Assign Recruiter (Associate Analyst)</InputLabel>
                  <Select
                    multiple
                    value={assigneeIds}
                    label="Assign Recruiter (Associate Analyst)"
                    onChange={(e) => {
                      const value = e.target.value;
                      setAssigneeIds(typeof value === 'string' ? value.split(',') : value);
                    }}
                    renderValue={(selected) => selected.map(id => {
                      const user = teamMembers.find(m => m.email === id || m.id === id);
                      return user ? user.full_name : id;
                    }).join(', ')}
                  >
                    {teamMembers.map(member => (
                      <MenuItem key={member.email} value={member.email}>
                        <Checkbox checked={assigneeIds.includes(member.email)} />
                        <ListItemText primary={`${member.full_name} (${member.email})`} />
                      </MenuItem>
                    ))}
                    {teamMembers.length === 0 && (
                      <MenuItem disabled value="">
                        No Associate Analysts available on your team.
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            {/* SECTION 4: DOCUMENTS UPLOAD */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              📎 Document Upload Options
            </Typography>
            <Box sx={{ mb: 4 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<Upload size={16} />}
                  sx={{ textTransform: 'none', borderRadius: '8px' }}
                >
                  Attach JD / Client Docs
                  <input
                    type="file"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormData({ ...formData, fileName: file.name });
                      }
                    }}
                  />
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {formData.fileName || 'No file attached'}
                </Typography>
              </Stack>
            </Box>

            {/* Form actions */}
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
                color="primary"
                sx={{ px: 5, borderRadius: '8px', fontWeight: 750 }}
                disabled={submitting || teamMembers.length === 0}
              >
                {submitting ? 'Posting...' : 'Create & Assign Requirement'}
              </Button>
            </Box>

          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
