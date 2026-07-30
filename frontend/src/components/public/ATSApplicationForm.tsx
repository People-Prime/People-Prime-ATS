import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  FormControlLabel,
  Checkbox,
  Divider,
  Paper
} from '@mui/material';
import { CheckCircle2, ArrowLeft, Send } from 'lucide-react';
import { ATSInput } from './ATSInput';
import { ATSFileUpload } from './ATSFileUpload';
import { ATSTermsModal } from './ATSTermsModal';
import { ATSSubmitButton } from './ATSSubmitButton';
import {
  FormDataState,
  FormErrors,
  validateField,
  validateAllFields
} from './ATSValidation';

interface ATSApplicationFormProps {
  jobId: number | string;
  jobPosition: string;
  jobCode?: string;
  onCancel: () => void;
  onSuccessBackToJobs: () => void;
}

export const ATSApplicationForm: React.FC<ATSApplicationFormProps> = ({
  jobId,
  jobPosition,
  jobCode,
  onCancel,
  onSuccessBackToJobs
}) => {
  const [formData, setFormData] = useState<FormDataState>({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    alternateMobileNumber: '',
    emailAddress: '',
    qualification: '',
    yearsOfExperience: '',
    expectedPay: '',
    primarySkills: '',
    currentCtc: '',
    currentCompany: '',
    state: '',
    city: '',
    resume: null,
    termsAccepted: false
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleInputChange = (field: keyof FormDataState) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: val }));
    
    // Clear error inline on change
    const fieldError = validateField(field, val);
    setErrors(prev => ({ ...prev, [field]: fieldError }));
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateAllFields(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Placeholder submit handler ready for future POST /api/public/jobs/{job_id}/apply/ backend integration
      const submitPayload = new FormData();
      submitPayload.append('job_id', String(jobId));
      submitPayload.append('first_name', formData.firstName.trim());
      submitPayload.append('last_name', formData.lastName.trim());
      submitPayload.append('mobile_number', formData.mobileNumber.trim());
      if (formData.alternateMobileNumber.trim()) {
        submitPayload.append('alternate_mobile_number', formData.alternateMobileNumber.trim());
      }
      submitPayload.append('email_address', formData.emailAddress.trim());
      submitPayload.append('qualification', formData.qualification.trim());
      submitPayload.append('years_of_experience', formData.yearsOfExperience.trim());
      submitPayload.append('expected_pay', formData.expectedPay.trim());
      submitPayload.append('primary_skills', formData.primarySkills.trim());
      submitPayload.append('current_ctc', formData.currentCtc.trim());
      submitPayload.append('current_company', formData.currentCompany.trim());
      submitPayload.append('state', formData.state.trim());
      submitPayload.append('city', formData.city.trim());
      if (formData.resume) {
        submitPayload.append('resume', formData.resume);
      }

      console.log(`[ATS Candidate Application] Form data prepared for job_id: ${jobId}`, {
        jobId,
        position: jobPosition,
        jobCode,
        formData
      });

      // Simulate submission transition
      setTimeout(() => {
        setIsSubmitting(false);
        setIsSubmitted(true);
      }, 600);

    } catch (err) {
      console.error('Submission failed', err);
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 3, md: 5 },
          borderRadius: '16px',
          textAlign: 'center',
          maxWidth: 650,
          mx: 'auto',
          mt: 4,
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: 'success.light',
            color: 'success.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2.5
          }}
        >
          <CheckCircle2 size={40} />
        </Box>

        <Typography variant="h4" fontWeight={800} gutterBottom>
          Application Submitted Successfully
        </Typography>

        <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 4, lineHeight: 1.6 }}>
          Thank you for applying. Our recruitment team will review your application and contact you if your profile matches our requirements.
        </Typography>

        <Button
          variant="contained"
          color="primary"
          onClick={onSuccessBackToJobs}
          startIcon={<ArrowLeft size={18} />}
          sx={{ borderRadius: '8px', px: 4, py: 1.2, fontWeight: 750 }}
        >
          Back to Jobs
        </Button>
      </Paper>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: '16px',
        maxWidth: 850,
        mx: 'auto',
        mt: 2,
        mb: 6,
        boxShadow: '0 12px 32px rgba(0,0,0,0.08)'
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        {/* Form Header */}
        <Box sx={{ mb: 3 }}>
          <Button
            onClick={onCancel}
            startIcon={<ArrowLeft size={16} />}
            size="small"
            sx={{ mb: 1.5, textTransform: 'none', borderRadius: '6px' }}
          >
            Back to Job Details
          </Button>

          <Typography variant="h4" fontWeight={800} color="text.primary">
            Apply for {jobPosition}
          </Typography>
          {jobCode && (
            <Typography variant="subtitle2" color="primary.main" fontWeight={700} sx={{ mt: 0.5 }}>
              Job Code: {jobCode}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Please fill out all required details below to submit your job application.
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <form onSubmit={handleApply} noValidate>
          <Grid container spacing={2.5}>
            {/* 1. First Name */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="First Name"
                required
                value={formData.firstName}
                onChange={handleInputChange('firstName')}
                error={errors.firstName}
                placeholder="e.g. Rahul"
              />
            </Grid>

            {/* 2. Last Name */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Last Name"
                required
                value={formData.lastName}
                onChange={handleInputChange('lastName')}
                error={errors.lastName}
                placeholder="e.g. Sharma"
              />
            </Grid>

            {/* 3. Mobile Number */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Mobile Number"
                required
                value={formData.mobileNumber}
                onChange={handleInputChange('mobileNumber')}
                error={errors.mobileNumber}
                placeholder="10-digit mobile number"
                inputProps={{ maxLength: 10 }}
              />
            </Grid>

            {/* 4. Alternate Mobile Number (Optional) */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Alternate Mobile Number"
                value={formData.alternateMobileNumber}
                onChange={handleInputChange('alternateMobileNumber')}
                error={errors.alternateMobileNumber}
                placeholder="Optional 10-digit mobile"
                inputProps={{ maxLength: 10 }}
              />
            </Grid>

            {/* 5. Email Address */}
            <Grid item xs={12}>
              <ATSInput
                label="Email Address"
                required
                type="email"
                value={formData.emailAddress}
                onChange={handleInputChange('emailAddress')}
                error={errors.emailAddress}
                placeholder="e.g. rahul.sharma@example.com"
              />
            </Grid>

            {/* 6. Qualification */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Qualification"
                required
                value={formData.qualification}
                onChange={handleInputChange('qualification')}
                error={errors.qualification}
                placeholder="e.g. B.Tech in Computer Science"
              />
            </Grid>

            {/* 7. Years of Experience */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Years of Experience"
                required
                value={formData.yearsOfExperience}
                onChange={handleInputChange('yearsOfExperience')}
                error={errors.yearsOfExperience}
                placeholder="e.g. 5"
              />
            </Grid>

            {/* 8. Expected Pay */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Expected Pay"
                required
                value={formData.expectedPay}
                onChange={handleInputChange('expectedPay')}
                error={errors.expectedPay}
                placeholder="e.g. 1200000"
              />
            </Grid>

            {/* 9. Primary Skills */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Primary Skills"
                required
                value={formData.primarySkills}
                onChange={handleInputChange('primarySkills')}
                error={errors.primarySkills}
                placeholder="e.g. React, TypeScript, Node.js"
              />
            </Grid>

            {/* 10. Current CTC */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Current CTC"
                required
                value={formData.currentCtc}
                onChange={handleInputChange('currentCtc')}
                error={errors.currentCtc}
                placeholder="e.g. 900000"
              />
            </Grid>

            {/* 11. Current Company */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="Current Company"
                required
                value={formData.currentCompany}
                onChange={handleInputChange('currentCompany')}
                error={errors.currentCompany}
                placeholder="e.g. Acme Tech Solutions"
              />
            </Grid>

            {/* 12. State */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="State"
                required
                value={formData.state}
                onChange={handleInputChange('state')}
                error={errors.state}
                placeholder="e.g. Karnataka"
              />
            </Grid>

            {/* 13. City */}
            <Grid item xs={12} sm={6}>
              <ATSInput
                label="City"
                required
                value={formData.city}
                onChange={handleInputChange('city')}
                error={errors.city}
                placeholder="e.g. Bengaluru"
              />
            </Grid>

            {/* 14. Resume Upload */}
            <Grid item xs={12}>
              <ATSFileUpload
                file={formData.resume}
                onFileSelect={(file) => {
                  setFormData(prev => ({ ...prev, resume: file }));
                  setErrors(prev => ({ ...prev, resume: validateField('resume', file) }));
                }}
                error={errors.resume}
                onErrorChange={(err) => setErrors(prev => ({ ...prev, resume: err }))}
              />
            </Grid>

            {/* 15. Terms & Conditions Checkbox */}
            <Grid item xs={12}>
              <Box sx={{ mt: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.termsAccepted}
                      onChange={handleInputChange('termsAccepted')}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.primary">
                      I have read and agree to the{' '}
                      <Typography
                        component="span"
                        color="primary"
                        sx={{
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          setIsTermsModalOpen(true);
                        }}
                      >
                        Terms & Conditions
                      </Typography>
                      . <Typography component="span" color="error.main">*</Typography>
                    </Typography>
                  }
                />
                {errors.termsAccepted && (
                  <Typography
                    variant="caption"
                    color="error.main"
                    sx={{ display: 'block', ml: 4, mt: 0.25, fontWeight: 600 }}
                  >
                    {errors.termsAccepted}
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>

          {/* Form Action Buttons */}
          <Box
            sx={{
              display: 'flex',
              justify: 'flex-end',
              alignItems: 'center',
              gap: 2,
              mt: 4,
              pt: 2,
              borderTop: (theme: any) => `1px solid ${theme.palette.divider}`
            }}
          >
            <Button
              variant="outlined"
              onClick={onCancel}
              disabled={isSubmitting}
              sx={{ borderRadius: '8px', px: 3, fontWeight: 600 }}
            >
              Cancel
            </Button>

            <ATSSubmitButton
              type="submit"
              loading={isSubmitting}
              startIcon={<Send size={18} />}
            >
              Apply
            </ATSSubmitButton>
          </Box>
        </form>
      </CardContent>

      {/* Terms & Conditions Modal */}
      <ATSTermsModal
        open={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />
    </Card>
  );
};
