import React from 'react';
import { TextField, TextFieldProps, Typography, Box } from '@mui/material';

interface ATSInputProps extends Omit<TextFieldProps, 'error' | 'helperText'> {
  label: string;
  required?: boolean;
  error?: string;
}

export const ATSInput: React.FC<ATSInputProps> = ({
  label,
  required = false,
  error,
  value,
  onChange,
  ...props
}) => {
  return (
    <Box sx={{ width: '100%' }}>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          mb: 0.75,
          color: 'text.primary',
          fontSize: '0.85rem'
        }}
      >
        {label} {required && <Typography component="span" color="error.main">*</Typography>}
      </Typography>
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={onChange}
        error={Boolean(error)}
        helperText={error || ''}
        FormHelperTextProps={{
          sx: {
            ml: 0.5,
            fontSize: '0.75rem',
            color: 'error.main',
            fontWeight: 600
          }
        }}
        InputProps={{
          sx: {
            borderRadius: '8px',
            fontSize: '0.9rem'
          }
        }}
        {...props}
      />
    </Box>
  );
};
