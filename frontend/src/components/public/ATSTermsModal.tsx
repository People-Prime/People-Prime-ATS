import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton
} from '@mui/material';
import { X, ShieldCheck } from 'lucide-react';

interface ATSTermsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ATSTermsModal: React.FC<ATSTermsModalProps> = ({ open, onClose }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          pt: 3,
          px: 3
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ShieldCheck size={24} color="#3b82f6" />
          <Typography variant="h6" fontWeight={800}>
            Terms & Conditions
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="close">
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600 }}>
          People Prime Worldwide — Candidate Application & Privacy Terms
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              1. Introduction
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Welcome to People Prime Worldwide. By submitting your job application through our career portal, you agree to comply with and be bound by the following Terms & Conditions. Please review them carefully before submitting your application.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              2. Accuracy of Information
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              You certify that all information provided in your application, including your personal details, qualifications, work history, skills, experience, and uploaded resume, is true, accurate, complete, and current to the best of your knowledge. Any misrepresentation, falsification, or omission of material facts may lead to the immediate disqualification of your application or termination of employment if subsequently hired.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              3. Data Privacy and Processing Consent
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              By applying, you explicitly consent to People Prime Worldwide collecting, storing, processing, and evaluating your personal data and resume for recruitment, talent matching, background verification, and potential placement purposes. Your profile data may be shared with hiring managers, client companies, and authorized evaluation partners solely for employment opportunities matching your skills.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              4. Communication Consent
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              You consent to receive communications from People Prime Worldwide’s recruitment team via email, phone calls, SMS, or WhatsApp regarding your application status, interview schedules, skill assessments, and future job opportunities.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              5. Background and Document Verification
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              You acknowledge and consent that People Prime Worldwide or its designated verification partners may conduct educational, professional reference, employment history, and identity verification checks as part of the formal evaluation process.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              6. Rights Reserved
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              People Prime Worldwide reserves the right to modify job listings, close positions, update requirements, or decline candidate applications at its sole discretion without prior notice.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={800} color="primary.main" gutterBottom>
              7. Contact & Support
            </Typography>
            <Typography variant="body2" color="text.secondary">
              If you have any questions or concerns regarding these Terms & Conditions or data privacy, please reach out to our recruitment compliance team at <strong>support@people-prime.com</strong>.
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          color="primary"
          sx={{ borderRadius: '8px', px: 3, fontWeight: 700 }}
        >
          Close & Return to Application
        </Button>
      </DialogActions>
    </Dialog>
  );
};
