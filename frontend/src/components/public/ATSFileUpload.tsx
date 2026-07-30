import React, { useRef } from 'react';
import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import { UploadCloud, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { validateResumeFile } from './ATSValidation';

interface ATSFileUploadProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  error?: string;
  onErrorChange: (err: string) => void;
}

export const ATSFileUpload: React.FC<ATSFileUploadProps> = ({
  file,
  onFileSelect,
  error,
  onErrorChange
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (selected) {
      const err = validateResumeFile(selected);
      if (err) {
        onErrorChange(err);
        onFileSelect(null);
      } else {
        onErrorChange('');
        onFileSelect(selected);
      }
    }
  };

  const handleRemove = () => {
    onFileSelect(null);
    onErrorChange('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75, fontSize: '0.85rem' }}>
        Resume Upload <Typography component="span" color="error.main">*</Typography>
      </Typography>

      <Paper
        variant="outlined"
        onClick={() => inputRef.current?.click()}
        sx={{
          p: 3,
          borderRadius: '12px',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: error ? 'error.main' : file ? 'success.main' : 'divider',
          bgcolor: file ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: error ? 'error.main' : 'primary.main',
            bgcolor: 'action.hover'
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <Stack spacing={1.5} alignItems="center" textAlign="center">
          {file ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
                <CheckCircle2 size={24} />
                <Typography variant="subtitle2" fontWeight={700}>
                  Resume Attached
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <FileText size={18} />
                <Typography variant="body2" fontWeight={600} color="text.primary">
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </Typography>
              </Stack>
              <Button
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                sx={{ textTransform: 'none', borderRadius: '6px' }}
              >
                Change or Remove File
              </Button>
            </>
          ) : (
            <>
              <UploadCloud size={32} color="#3b82f6" />
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  Click or Drop your Resume here
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supported formats: PDF, DOC, DOCX (Max size: 10 MB)
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      </Paper>

      {error && (
        <Typography
          variant="caption"
          color="error.main"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75, ml: 0.5, fontWeight: 600 }}
        >
          <XCircle size={14} /> {error}
        </Typography>
      )}
    </Box>
  );
};
