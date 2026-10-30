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
  ListItemText,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Paper
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

  // Form states
  const [formData, setFormData] = useState({
    // Structured Job Location (LinkedIn & ATS)
    country: '',
    state: '',
    city: '',

    // Job Details
    jobCode: '',
    jobTitle: '',
    clientBillRate: '',
    payRate: '',
    salaryCurrency: 'INR',
    salaryPeriod: 'Unknown',
    budgetConfirmed: false,
    startDate: '',
    endDate: '',
    contractBillingDuration: '',
    contractTenure: '',
    contractJoiningDate: '',
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
    maxExperience: '',
    primarySkills: '',
    description: '',

    // Notice Period
    noticePeriod: '',

    // Document options
    docSource: '',
    fileName: '',

    // Publishing Options
    publishToCareerPage: false,
    publishToLinkedin: false,
    publishToFoundit: false
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLoadingJob, setIsLoadingJob] = useState<boolean>(Boolean(applicationId));
  const [jobLoadError, setJobLoadError] = useState<string>('');
  const [existingGroupApps, setExistingGroupApps] = useState<any[]>([]);
  const [clientBillRateError, setClientBillRateError] = useState('');
  const [payRateError, setPayRateError] = useState('');
  const [maxExperienceError, setMaxExperienceError] = useState('');

  const handleExperienceChange = (val: string) => {
    setFormData(prev => ({ ...prev, experience: val }));
    if (formData.maxExperience && val && /^\d+$/.test(formData.maxExperience)) {
      if (parseFloat(formData.maxExperience) < parseFloat(val)) {
        setMaxExperienceError('Maximum Experience must be greater than or equal to Minimum Experience.');
      } else {
        setMaxExperienceError('');
      }
    }
  };

  const handleMaxExperienceChange = (val: string) => {
    setFormData(prev => ({ ...prev, maxExperience: val }));
    if (!val || !val.trim()) {
      setMaxExperienceError('');
    } else if (!/^\d+$/.test(val)) {
      setMaxExperienceError('Accept non-negative whole numbers only (e.g. 8).');
    } else if (formData.experience && parseFloat(val) < parseFloat(formData.experience)) {
      setMaxExperienceError('Maximum Experience must be greater than or equal to Minimum Experience.');
    } else {
      setMaxExperienceError('');
    }
  };

  const handleClientBillRateChange = (val: string) => {
    setFormData(prev => ({ ...prev, clientBillRate: val }));
    if (!val || !val.trim()) {
      setClientBillRateError('');
    } else if (!/^\d+$/.test(val) || val.length < 5) {
      setClientBillRateError('Enter a numeric amount containing at least 5 digits.');
    } else {
      setClientBillRateError('');
    }
  };

  const handlePayRateChange = (val: string) => {
    setFormData(prev => ({ ...prev, payRate: val }));
    if (!val || !val.trim()) {
      setPayRateError('');
    } else if (!/^\d+$/.test(val) || val.length < 5) {
      setPayRateError('Enter a numeric amount containing at least 5 digits.');
    } else {
      setPayRateError('');
    }
  };

  // Foundit post-save validation & publication workflow states
  const [postSaveActionJobId, setPostSaveActionJobId] = useState<number | null>(null);
  const [validatingFoundit, setValidatingFoundit] = useState(false);
  const [founditValidationResult, setFounditValidationResult] = useState<{
    valid?: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [publishingFoundit, setPublishingFoundit] = useState(false);
  const [confirmLiveFounditOpen, setConfirmLiveFounditOpen] = useState(false);
  const [founditPublishResult, setFounditPublishResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

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
    if (!applicationId) return;

    let isMounted = true;
    setIsLoadingJob(true);
    setJobLoadError('');

    const fetchJobAndSiblings = async () => {
      try {
        const res = await api.get(`applications/${applicationId}/`);
        const app = res.data;
        if (!isMounted) return;

        const remarks = app.remarks || '';
        const extractField = (fieldName: string): string => {
          const regex = new RegExp(`${fieldName}:\\s*(.*)`);
          const match = remarks.match(regex);
          return match ? match[1].trim() : '';
        };

        const matchJobCode = remarks.match(/Job Code:\s*(.+)/);
        const jobCode = matchJobCode ? matchJobCode[1].trim() : `PPW - ${String(app.id).padStart(4, '0')}`;

        // Find all applications with the same Job Code to get assigneeIds and preserve grouped records
        let groupApps: any[] = [app];
        try {
          const siblingRes = await api.get(`applications/?is_job_posting=true&global_search=${encodeURIComponent(jobCode)}`);
          const siblingList = siblingRes.data?.results ?? (Array.isArray(siblingRes.data) ? siblingRes.data : []);
          const matchedSiblings = siblingList.filter((a: any) => {
            const aRemarks = a.remarks || '';
            const aMatch = aRemarks.match(/Job Code:\s*(.+)/);
            const aCode = aMatch ? aMatch[1].trim() : '';
            return aCode === jobCode && !a.candidate_name;
          });
          if (matchedSiblings.length > 0) {
            groupApps = matchedSiblings;
            if (!groupApps.some((a: any) => String(a.id) === String(app.id))) {
              groupApps.push(app);
            }
          }
        } catch (siblingErr) {
          console.warn('Could not fetch sibling applications by job code, using primary app:', siblingErr);
        }

        if (!isMounted) return;

        setExistingGroupApps(groupApps);

        const emails = groupApps
          .map((a: any) => a.assigned_employee?.email)
          .filter(Boolean) as string[];

        if (emails.length === 0 && app.assigned_employee_id) {
          emails.push(app.assigned_employee_id);
        }

        setAssigneeIds(emails);

        let maxExp = extractField('Max Experience') || extractField('Maximum Experience') || '';
        if (!maxExp) {
          const rangeMatch = remarks.match(/(?:Total\s+)?Experience\s*(?:Required)?\s*:\s*\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
          if (rangeMatch) {
            maxExp = rangeMatch[1];
          }
        }

        setFormData({
          country: app.country || extractField('Country') || '',
          state: app.state || extractField('State') || '',
          city: app.city || extractField('City') || '',
          jobCode: jobCode,
          jobTitle: app.position || '',
          clientBillRate: extractField('Client Bill Rate') || '',
          payRate: extractField('Pay Rate') || '',
          salaryCurrency: extractField('Salary Currency') || extractField('Currency') || 'INR',
          salaryPeriod: extractField('Salary Period') || extractField('Budget Period') || extractField('Pay Period') || 'Unknown',
          budgetConfirmed: extractField('Client Budget Confirmed') === 'Yes' || extractField('Budget Confirmed') === 'Yes',
          startDate: extractField('Start Date') || new Date().toISOString().split('T')[0],
          endDate: extractField('End Date') === 'N/A' ? '' : extractField('End Date'),
          contractBillingDuration: extractField('Foundit Contract Billing Duration') || '',
          contractTenure: extractField('Foundit Contract Tenure') || '',
          contractJoiningDate: extractField('Foundit Contract Joining Date') || '',
          location: extractField('Location') || '',
          jobStatus: extractField('Job Status') || 'Active',
          jobType: extractField('Job Type') || '',
          client: app.client_name || '',
          clientJobId: extractField('Client Job ID') || '',
          requiredDocs: extractField('Required Documents') || 'Resume, ID Proof',
          address: extractField('Address') || '',
          workMode: extractField('Work Mode') || 'On-site',
          employeeType: extractField('Employee Type') || 'W2',
          zipCode: extractField('Zip Code') || '',
          degree: extractField('Degree') || 'Bachelors Degree',
          experience: String(app.experience) || '3',
          maxExperience: maxExp,
          primarySkills: app.technology || '',
          description: extractField('Description') || '',
          noticePeriod: extractField('Notice Period') || 'Immediate',
          docSource: extractField('Source Option') || 'PC',
          fileName: extractField('FileName') === 'No document uploaded' ? '' : extractField('FileName'),
          publishToCareerPage: Boolean(app.publish_to_career_page),
          publishToLinkedin: Boolean(app.publish_to_linkedin),
          publishToFoundit: Boolean(app.publish_to_foundit)
        });
      } catch (err: any) {
        console.error('Failed to load job for editing:', err);
        if (isMounted) {
          const detail = err.response?.data?.detail || err.response?.data?.error || err.message || 'Failed to load job requirements. Please try again.';
          setJobLoadError(detail);
        }
      } finally {
        if (isMounted) {
          setIsLoadingJob(false);
        }
      }
    };

    fetchJobAndSiblings();

    return () => {
      isMounted = false;
    };
  }, [applicationId]);

  const handleValidateFoundit = async (jobIdToValidate: number) => {
    setValidatingFoundit(true);
    setFounditValidationResult(null);
    try {
      const res = await api.get(`applications/${jobIdToValidate}/validate-foundit/`);
      setFounditValidationResult({
        valid: true,
        message: res.data.message || 'Job passed all Foundit validation checks and is ready for publication.'
      });
    } catch (err: any) {
      const errData = err.response?.data;
      const msg = errData?.error || 'Validation failed. Please verify job criteria.';
      setFounditValidationResult({
        valid: false,
        error: msg
      });
    } finally {
      setValidatingFoundit(false);
    }
  };

  const handlePublishFoundit = async (
    jobIdToPublish: number,
    dryRun: boolean = true,
    confirmLive: boolean = false
  ) => {
    if (!dryRun && !confirmLive) {
      setFounditPublishResult({
        success: false,
        error: 'Live publication requires explicit confirmation.'
      });
      return;
    }

    setPublishingFoundit(true);
    setFounditPublishResult(null);
    try {
      const payload = dryRun
        ? { dry_run: true }
        : { dry_run: false, confirm_live: true };
      const res = await api.post(`applications/${jobIdToPublish}/publish-foundit/`, payload);
      const isDryRun = res.data.dry_run === true || res.data.status === 'VALIDATED';
      setFounditPublishResult({
        success: !isDryRun && res.data.success === true && res.data.status === 'PUBLISHED',
        error: !isDryRun && !(res.data.success === true && res.data.status === 'PUBLISHED')
          ? (res.data.error || res.data.message || 'Publication was not confirmed.')
          : undefined,
        message: isDryRun
          ? `Validated — not published. ${res.data.message || 'Dry run completed without a live Foundit request.'}`
          : res.data.message
      });
    } catch (err: any) {
      const errData = err.response?.data;
      const msg = errData?.error || errData?.message || 'Failed to publish to Foundit.';
      setFounditPublishResult({
        success: false,
        error: msg
      });
    } finally {
      setPublishingFoundit(false);
    }
  };

  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (submitting) return;
    if (applicationId && (isLoadingJob || Boolean(jobLoadError))) {
      setError('Cannot save changes: Job requirement data has not finished loading or encountered an error. Please refresh the page.');
      return;
    }
    setSuccess('');

    if (!formData.client || !formData.client.trim()) {
      setError('Client Name is a mandatory field. Please enter the Client Name before creating and assigning the requirement.');
      return;
    }

    if (!formData.jobType || !formData.jobType.trim()) {
      setError('Job Type is a mandatory field. Please select an option from the Job Type dropdown menu before creating and assigning the requirement.');
      return;
    }

    if (!formData.country || !formData.country.trim() || !formData.state || !formData.state.trim() || !formData.city || !formData.city.trim()) {
      setError('Country, State and City are required for every job.');
      return;
    }

    if (!formData.jobTitle || !formData.primarySkills || !formData.experience || !formData.location || !formData.jobStatus || !formData.description) {
      setError('Please fill in all required fields (Client, Job Title, Primary Skills, Experience, Location, Job Status, Job Type, Detailed Job Description).');
      return;
    }

    if (formData.description.trim().length < 100) {
      setError('Job description is less than 100 characters.');
      return;
    }

    if (formData.clientBillRate && (!/^\d+$/.test(formData.clientBillRate) || formData.clientBillRate.length < 5)) {
      setClientBillRateError('Enter a numeric amount containing at least 5 digits.');
      setError('Client Bill Rate: Enter a numeric amount containing at least 5 digits.');
      return;
    }

    if (formData.payRate && (!/^\d+$/.test(formData.payRate) || formData.payRate.length < 5)) {
      setPayRateError('Enter a numeric amount containing at least 5 digits.');
      setError('Pay Rate / Salary: Enter a numeric amount containing at least 5 digits.');
      return;
    }

    if (!formData.publishToCareerPage) {
      setError('⚠️ "Publish to Company Career Page" is mandatory. Please check this box before submitting the job requirement.');
      return;
    }

    if (!applicationId && !formData.publishToFoundit) {
      setError('Please select Publish to Foundit before creating the job requirement.');
      return;
    }

    if (formData.maxExperience && formData.maxExperience.trim()) {
      if (!/^\d+$/.test(formData.maxExperience)) {
        setMaxExperienceError('Accept non-negative whole numbers only (e.g. 8).');
        setError('Maximum Experience: Accept non-negative whole numbers only.');
        return;
      }
      if (formData.experience && parseFloat(formData.maxExperience) < parseFloat(formData.experience)) {
        setMaxExperienceError('Maximum Experience must be greater than or equal to Minimum Experience.');
        setError('Maximum Experience must be greater than or equal to Minimum Experience.');
        return;
      }
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
        let groupApps = [...existingGroupApps];
        if (groupApps.length === 0) {
          try {
            const freshRes = await api.get(`applications/${applicationId}/`);
            if (freshRes.data) {
              groupApps = [freshRes.data];
            }
          } catch (fetchErr) {
            setError('Could not verify existing job requirement. Save aborted to prevent unintended duplicate job creation.');
            setSubmitting(false);
            return;
          }
        }

        const primaryJobId = Number(applicationId);
        const primaryApp = groupApps.find(a => Number(a.id) === primaryJobId) || groupApps[0];

        const formattedRemarks = `[Job Details]
Job Code: ${formData.jobCode}
Client Bill Rate: ${formData.clientBillRate}
Pay Rate: ${formData.payRate}
Salary Currency: ${formData.salaryCurrency}
Salary Period: ${formData.salaryPeriod}
Client Budget Confirmed: ${formData.budgetConfirmed ? 'Yes' : 'No'}
Start Date: ${formData.startDate}
End Date: ${formData.endDate || 'N/A'}
Foundit Contract Billing Duration: ${formData.contractBillingDuration}
Foundit Contract Tenure: ${formData.contractTenure}
Foundit Contract Joining Date: ${formData.contractJoiningDate}
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
Experience: ${formData.experience}${formData.maxExperience ? ` - ${formData.maxExperience} years` : ' years'}
Max Experience: ${formData.maxExperience || ''}
Description: ${formData.description}

[Notice Period]
Notice Period: ${formData.noticePeriod}

[Document Attachment]
Source Option: ${formData.docSource}
FileName: ${formData.fileName || 'No document uploaded'}`;

        const basePayload = {
          client_name: formData.client,
          city: formData.city.trim(),
          state: formData.state.trim(),
          country: formData.country.trim(),
          position: formData.jobTitle,
          technology: formData.primarySkills,
          experience: parseFloat(formData.experience) || 0.0,
          max_experience: formData.maxExperience || '',
          remarks: formattedRemarks,
          publish_to_career_page: formData.publishToCareerPage,
          publish_to_linkedin: formData.publishToLinkedin,
          publish_to_foundit: formData.publishToFoundit
        };

        // Match assignees with existing application rows
        const usedAppIds = new Set<number>();
        const appToEmail = new Map<number, string>();
        const unassignedEmails: string[] = [];

        // 1. Direct match: where an existing app's assigned employee email matches a selected assignee
        for (const email of assigneeIds) {
          const matchedApp = groupApps.find(a => !usedAppIds.has(a.id) && (a.assigned_employee?.email === email || a.assigned_employee_id === email));
          if (matchedApp) {
            usedAppIds.add(matchedApp.id);
            appToEmail.set(matchedApp.id, email);
          } else {
            unassignedEmails.push(email);
          }
        }

        // 2. Safeguard the primary job record being edited:
        // If primaryApp was not directly matched (e.g. its assignee was changed or swapped),
        // assign it to the first unassigned email so primaryApp is ALWAYS updated via PUT and never deleted or duplicated!
        if (primaryApp && !usedAppIds.has(primaryApp.id) && unassignedEmails.length > 0) {
          const reassignedEmail = unassignedEmails.shift()!;
          usedAppIds.add(primaryApp.id);
          appToEmail.set(primaryApp.id, reassignedEmail);
        }

        // 3. For any remaining unused existing sibling apps, pair them with remaining unassigned emails
        for (const app of groupApps) {
          if (!usedAppIds.has(app.id) && unassignedEmails.length > 0) {
            const nextEmail = unassignedEmails.shift()!;
            usedAppIds.add(app.id);
            appToEmail.set(app.id, nextEmail);
          }
        }

        // Execute updates for matched / reassigned applications
        const updatePromises = Array.from(appToEmail.entries()).map(async ([appId, email]) => {
          const payload = {
            ...basePayload,
            assigned_employee_id: email
          };
          const res = await api.put(`applications/${appId}/`, payload);
          dispatch(updateApplication(res.data));
          return res.data;
        });

        // Execute creates for brand-new assignees exceeding existing sibling records
        const createPromises = unassignedEmails.map(async (email) => {
          const payload = {
            ...basePayload,
            assigned_employee_id: email
          };
          const res = await api.post('applications/', payload);
          dispatch(addApplication(res.data));
          return res.data;
        });

        // Execute deletes for genuinely deselected sibling apps (never delete primaryApp)
        const deselectedApps = groupApps.filter(a => !usedAppIds.has(a.id) && a.id !== primaryJobId);
        const deletePromises = deselectedApps.map(async (desApp) => {
          await api.delete(`applications/${desApp.id}/`);
          dispatch(deleteApplication(String(desApp.id)));
        });

        await Promise.all([...updatePromises, ...createPromises, ...deletePromises]);

        if (formData.publishToFoundit && applicationId) {
          setPostSaveActionJobId(Number(applicationId));
          setSuccess(`✅ Job requirement for "${formData.jobTitle}" updated successfully!`);
        } else {
          setSuccess(`✅ Job requirement for "${formData.jobTitle}" updated successfully!`);
          setTimeout(() => navigate('/job-postings'), 400);
        }
      } else {
        // Create mode!
        const buildRemarks = (jobCodeVal: string) => `[Job Details]
Job Code: ${jobCodeVal}
Client Bill Rate: ${formData.clientBillRate}
Pay Rate: ${formData.payRate}
Salary Currency: ${formData.salaryCurrency}
Salary Period: ${formData.salaryPeriod}
Client Budget Confirmed: ${formData.budgetConfirmed ? 'Yes' : 'No'}
Start Date: ${formData.startDate}
End Date: ${formData.endDate || 'N/A'}
Foundit Contract Billing Duration: ${formData.contractBillingDuration}
Foundit Contract Tenure: ${formData.contractTenure}
Foundit Contract Joining Date: ${formData.contractJoiningDate}
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
Experience: ${formData.experience}${formData.maxExperience ? ` - ${formData.maxExperience} years` : ' years'}
Max Experience: ${formData.maxExperience || ''}
Description: ${formData.description}

[Notice Period]
Notice Period: ${formData.noticePeriod}

[Document Attachment]
Source Option: ${formData.docSource}
FileName: ${formData.fileName || 'No document uploaded'}`;

        // 1. Create first assignee application to generate the unique Job Code
        const firstId = assigneeIds[0];
        const firstUser = users.find(u => u.id === firstId || u.email === firstId);

        const firstPayload = {
          client_name: formData.client,
          city: formData.city.trim(),
          state: formData.state.trim(),
          country: formData.country.trim(),
          position: formData.jobTitle,
          technology: formData.primarySkills,
          experience: parseFloat(formData.experience) || 0.0,
          max_experience: formData.maxExperience || '',
          assigned_employee_id: firstUser ? firstUser.email : null,
          remarks: buildRemarks(formData.jobCode),
          publish_to_career_page: formData.publishToCareerPage,
          publish_to_linkedin: formData.publishToLinkedin,
          publish_to_foundit: formData.publishToFoundit
        };

        const firstResponse = await api.post('applications/', firstPayload);
        const returnedRemarks = firstResponse.data.remarks || '';
        const match = returnedRemarks.match(/Job Code:\s*(.+)/);
        const generatedJobCode = match ? match[1].trim() : formData.jobCode;
        dispatch(addApplication(firstResponse.data));

        // 2. Create any remaining assignee applications concurrently using the generated Job Code
        if (assigneeIds.length > 1) {
          const remainingIds = assigneeIds.slice(1);
          const remainingPromises = remainingIds.map(async (id) => {
            const assignedUser = users.find(u => u.id === id || u.email === id);
            const payload = {
              client_name: formData.client,
              city: formData.city.trim(),
              state: formData.state.trim(),
              country: formData.country.trim(),
              position: formData.jobTitle,
              technology: formData.primarySkills,
              experience: parseFloat(formData.experience) || 0.0,
              assigned_employee_id: assignedUser ? assignedUser.email : null,
              remarks: buildRemarks(generatedJobCode),
              publish_to_career_page: formData.publishToCareerPage,
              publish_to_linkedin: formData.publishToLinkedin,
              publish_to_foundit: formData.publishToFoundit
            };
            const res = await api.post('applications/', payload);
            dispatch(addApplication(res.data));
          });
          await Promise.all(remainingPromises);
        }

        if (formData.publishToFoundit) {
          setPostSaveActionJobId(firstResponse.data.id);
          setSuccess(`✅ Job requirement for "${formData.jobTitle}" created and assigned successfully! (Job ID: ${firstResponse.data.id})`);
        } else {
          setSuccess(`✅ Job requirement for "${formData.jobTitle}" created and assigned successfully!`);
          setTimeout(() => navigate('/'), 400);
        }
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
      {jobLoadError && <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>{jobLoadError}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }}>{success}</Alert>}

      {isLoadingJob ? (
        <Card sx={{ borderRadius: '16px', boxShadow: theme.shadows[3], p: 6, textAlign: 'center' }}>
          <CircularProgress size={40} sx={{ mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Loading job requirement details...
          </Typography>
        </Card>
      ) : (
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
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Client Bill Rate"
                  fullWidth
                  value={formData.clientBillRate}
                  onChange={(e) => handleClientBillRateChange(e.target.value)}
                  error={Boolean(clientBillRateError)}
                  helperText={clientBillRateError || 'Digits only (0–9), min 5 digits (e.g. 250000)'}
                  placeholder="e.g. 250000"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Pay Rate / Salary"
                  fullWidth
                  value={formData.payRate}
                  onChange={(e) => handlePayRateChange(e.target.value)}
                  error={Boolean(payRateError)}
                  helperText={payRateError || 'Digits only (0–9), min 5 digits (e.g. 1500000)'}
                  placeholder="e.g. 1500000"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="salary-currency-label">Currency</InputLabel>
                  <Select
                    labelId="salary-currency-label"
                    value={formData.salaryCurrency}
                    label="Currency"
                    onChange={(e) => setFormData(prev => ({ ...prev, salaryCurrency: e.target.value }))}
                  >
                    <MenuItem value="INR">INR (₹)</MenuItem>
                    <MenuItem value="USD">USD ($)</MenuItem>
                    <MenuItem value="EUR">EUR (€)</MenuItem>
                    <MenuItem value="GBP">GBP (£)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="salary-period-label">Budget Period</InputLabel>
                  <Select
                    labelId="salary-period-label"
                    value={formData.salaryPeriod}
                    label="Budget Period"
                    onChange={(e) => setFormData(prev => ({ ...prev, salaryPeriod: e.target.value }))}
                  >
                    <MenuItem value="Per Annum">Per Annum</MenuItem>
                    <MenuItem value="Per Month">Per Month</MenuItem>
                    <MenuItem value="Per Hour">Per Hour</MenuItem>
                    <MenuItem value="Unknown">Unknown</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {formData.salaryPeriod === 'Per Annum' && (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ mt: 1, mb: 1, backgroundColor: 'rgba(2, 136, 209, 0.08)' }}>
                    <Typography variant="body2" fontWeight={700} gutterBottom>
                      Client-Approved Budget Confirmation
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      The selected period must reflect the actual client-approved budget for this job opening. Client Bill Rate or candidate-specific salary must never be used as a fallback.
                    </Typography>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={Boolean(formData.budgetConfirmed)}
                          onChange={(e) => setFormData(prev => ({ ...prev, budgetConfirmed: e.target.checked }))}
                          color="primary"
                          size="small"
                        />
                      }
                      label={
                        <Typography variant="body2" fontWeight={600}>
                          I confirm that this Pay Rate / Salary reflects the actual client-approved annual budget for this opening (not client bill rate or candidate-specific salary).
                        </Typography>
                      }
                    />
                  </Alert>
                </Grid>
              )}

              {formData.salaryPeriod === 'Unknown' && (
                <Grid item xs={12}>
                  <Alert severity="warning" sx={{ mt: 1, mb: 1, py: 0.5 }}>
                    <Typography variant="caption" display="block">
                      <strong>Budget Period Unknown:</strong> Historical or unconfigured records default to Unknown. The recruiter must explicitly select and confirm the client-approved budget period before this job can become eligible for Foundit.
                    </Typography>
                  </Alert>
                </Grid>
              )}
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
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small" required error={Boolean(error && !formData.country)}>
                  <InputLabel id="country-label">Country *</InputLabel>
                  <Select
                    labelId="country-label"
                    value={formData.country}
                    label="Country *"
                    required
                    displayEmpty
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  >
                    <MenuItem value="" disabled>Select Country</MenuItem>
                    <MenuItem value="India">India</MenuItem>
                    <MenuItem value="US">US</MenuItem>
                    {formData.country && !['India', 'US'].includes(formData.country) && (
                      <MenuItem value={formData.country}>{formData.country}</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="State *"
                  required
                  fullWidth
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="e.g. Karnataka / Telangana"
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="City *"
                  required
                  fullWidth
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="e.g. Bangalore / Hyderabad"
                  size="small"
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
              {formData.jobType === 'Contract' && (
                <>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Foundit Contract Billing Duration</InputLabel>
                      <Select
                        value={formData.contractBillingDuration}
                        label="Foundit Contract Billing Duration"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contractBillingDuration: e.target.value,
                          })
                        }
                      >
                        <MenuItem value="per_month">Per Month</MenuItem>
                        <MenuItem value="per_year">Per Year</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Foundit Contract Tenure</InputLabel>
                      <Select
                        value={formData.contractTenure}
                        label="Foundit Contract Tenure"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contractTenure: e.target.value,
                          })
                        }
                      >
                        <MenuItem value="up_to_6_month">Up to 6 months</MenuItem>
                        <MenuItem value="from_6_to_12_month">6–12 months</MenuItem>
                        <MenuItem value="above_12_month">Above 12 months</MenuItem>
                        <MenuItem value="contract_to_hire">Contract to Hire</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Foundit Contract Joining Date"
                      type="date"
                      fullWidth
                      size="small"
                      value={formData.contractJoiningDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contractJoiningDate: e.target.value,
                        })
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              )}
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
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Experience Required (Years)"
                  required
                  fullWidth
                  type="number"
                  inputProps={{ step: '0.5', min: '0' }}
                  value={formData.experience}
                  onChange={(e) => handleExperienceChange(e.target.value)}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Maximum Experience (years)"
                  fullWidth
                  value={formData.maxExperience}
                  onChange={(e) => handleMaxExperienceChange(e.target.value)}
                  error={Boolean(maxExperienceError)}
                  helperText={maxExperienceError || (formData.publishToFoundit ? 'Required for Foundit (whole number ≥ min)' : 'Optional for ATS, whole number ≥ min')}
                  placeholder="e.g. 8"
                  size="small"
                  inputProps={{ min: '0', step: '1' }}
                />
              </Grid>
              <Grid item xs={12}>
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

            <Divider sx={{ my: 3 }} />

            {/* SECTION 5: PUBLISHING OPTIONS */}
            <Typography variant="subtitle1" color="primary" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              🌐 Publishing Options
            </Typography>
            <Box sx={{ mb: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.publishToCareerPage}
                          onChange={(e) => setFormData(prev => ({ ...prev, publishToCareerPage: e.target.checked }))}
                          color="error"
                          sx={!formData.publishToCareerPage ? { color: 'error.main' } : {}}
                        />
                      }
                      label={
                        <Typography variant="body2" fontWeight={700} sx={{ color: !formData.publishToCareerPage ? 'error.main' : 'text.primary' }}>
                          Publish to Company Career Page
                          <Typography component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Typography>
                        </Typography>
                      }
                    />
                    {!formData.publishToCareerPage && (
                      <Typography variant="caption" sx={{ color: 'error.main', display: 'block', ml: 4, mt: -0.5, fontWeight: 600 }}>
                        ⚠️ This is mandatory — please check this box to publish the job.
                      </Typography>
                    )}
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.publishToLinkedin}
                          onChange={(e) => setFormData(prev => ({ ...prev, publishToLinkedin: e.target.checked }))}
                          color="primary"
                        />
                      }
                      label={
                        <Typography variant="body2" fontWeight={600}>
                          Publish to LinkedIn
                        </Typography>
                      }
                    />
                  </Box>
                  <Box sx={{ mt: 1.5 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.publishToFoundit}
                          onChange={(e) => setFormData(prev => ({ ...prev, publishToFoundit: e.target.checked }))}
                          color={!formData.publishToFoundit && !applicationId ? "error" : "primary"}
                          sx={!formData.publishToFoundit && !applicationId ? { color: 'error.main' } : {}}
                        />
                      }
                      label={
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ color: !formData.publishToFoundit && !applicationId ? 'error.main' : 'text.primary' }}
                        >
                          Publish to Foundit
                          {!applicationId && <Typography component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Typography>}
                        </Typography>
                      }
                    />
                    {!formData.publishToFoundit && !applicationId ? (
                      <Typography variant="caption" sx={{ color: 'error.main', display: 'block', ml: 4, mt: -0.5, fontWeight: 600 }}>
                        ⚠️ Please select Publish to Foundit before creating the job requirement.
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', ml: 4, mt: -0.5 }}>
                        Select this option to enable publishing this job to Foundit.
                      </Typography>
                    )}
                    {formData.publishToFoundit && applicationId && (
                      <Box sx={{ ml: 4, mt: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          disabled={validatingFoundit}
                          onClick={() => handleValidateFoundit(Number(applicationId))}
                          startIcon={validatingFoundit ? <CircularProgress size={14} /> : null}
                          sx={{ textTransform: 'none', fontSize: '0.8rem', py: 0.2, px: 1.5 }}
                        >
                          {validatingFoundit ? 'Validating...' : 'Validate Foundit Requirements'}
                        </Button>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Box>

            {/* Form actions */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
              <Button 
                variant="outlined" 
                onClick={() => applicationId ? navigate('/job-postings') : navigate('/')}
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
                disabled={submitting || isLoadingJob || Boolean(jobLoadError) || assigneeIds.length === 0 || (!applicationId && teamMembers.length === 0)}
              >
                {submitting ? (applicationId ? 'Saving...' : 'Posting...') : (applicationId ? 'Save Changes' : 'Create & Assign Requirement')}
              </Button>
            </Box>

          </form>
        </CardContent>
      </Card>
      )}

      {/* Post-Save Foundit Validation & Publishing Action Dialog */}
      <Dialog
        open={Boolean(postSaveActionJobId)}
        onClose={() => {
          setPostSaveActionJobId(null);
          navigate('/job-postings');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          🎉 Job Requirement Saved
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Job requirement for <strong>{formData.jobTitle}</strong> has been saved with persistent ATS Job ID <strong>#{postSaveActionJobId}</strong>.
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🌐 Foundit Job Board Publishing Workflow
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Publishing to Foundit is enabled. You can now validate this saved job against Foundit's mandatory requirements (salary, experience, location, role) before proceeding.
            </Typography>

            {founditValidationResult?.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Foundit Validation Blocked</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{founditValidationResult.error}</Typography>
              </Alert>
            )}

            {founditValidationResult?.valid && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Validation Passed</Typography>
                <Typography variant="body2">{founditValidationResult.message || 'Job passed all Foundit criteria and is ready for publishing.'}</Typography>
              </Alert>
            )}

            {founditPublishResult?.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Publishing Error</Typography>
                <Typography variant="body2">{founditPublishResult.error}</Typography>
              </Alert>
            )}

            {founditPublishResult?.success && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Publication Status</Typography>
                <Typography variant="body2">{founditPublishResult.message}</Typography>
              </Alert>
            )}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          {founditValidationResult?.valid === false ? (
            <Button
              variant="outlined"
              color="warning"
              onClick={() => {
                setPostSaveActionJobId(null);
                // Dismiss modal and keep recruiter on form to fix errors
              }}
            >
              Edit Job Details to Fix Error
            </Button>
          ) : null}

          <Button
            variant="outlined"
            onClick={() => {
              setPostSaveActionJobId(null);
              navigate('/job-postings');
            }}
          >
            Done / View Job Postings
          </Button>

          <Button
            variant="contained"
            color="primary"
            disabled={validatingFoundit || !postSaveActionJobId}
            onClick={() => postSaveActionJobId && handleValidateFoundit(postSaveActionJobId)}
            startIcon={validatingFoundit ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {validatingFoundit ? 'Validating...' : 'Validate Foundit Requirements'}
          </Button>

          {founditValidationResult?.valid && (
            <>
              <Button
                variant="contained"
                color="success"
                disabled={publishingFoundit || !postSaveActionJobId}
                onClick={() => postSaveActionJobId && handlePublishFoundit(postSaveActionJobId, true)}
                startIcon={publishingFoundit ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {publishingFoundit ? 'Validating...' : 'Publish to Foundit (Dry Run)'}
              </Button>
              <Button
                variant="contained"
                color="warning"
                disabled={publishingFoundit || !postSaveActionJobId || founditPublishResult?.success === true}
                onClick={() => setConfirmLiveFounditOpen(true)}
              >
                Publish Live to Foundit
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmLiveFounditOpen}
        onClose={() => {
          if (!publishingFoundit) setConfirmLiveFounditOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Confirm Live Foundit Publication
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This sends a real publication request to Foundit. It is not a dry run.
          </Alert>
          <Typography variant="body1">
            Are you sure you want to publish ATS Job ID <strong>#{postSaveActionJobId}</strong> to Foundit?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Proceed only if this is the correct job and you are authorized to publish it.
            Foundit may accept, reject, or take additional time to display the job.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            variant="outlined"
            disabled={publishingFoundit}
            onClick={() => setConfirmLiveFounditOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={publishingFoundit || !postSaveActionJobId}
            onClick={() => {
              if (!postSaveActionJobId) return;
              setConfirmLiveFounditOpen(false);
              handlePublishFoundit(postSaveActionJobId, false, true);
            }}
          >
            {publishingFoundit ? 'Submitting...' : 'Confirm Live Publication'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
