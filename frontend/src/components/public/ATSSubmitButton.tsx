import React from 'react';
import { Button, ButtonProps, CircularProgress } from '@mui/material';

interface ATSSubmitButtonProps extends ButtonProps {
  loading?: boolean;
}

export const ATSSubmitButton: React.FC<ATSSubmitButtonProps> = ({
  children,
  loading = false,
  disabled,
  ...props
}) => {
  return (
    <Button
      variant="contained"
      color="primary"
      disabled={disabled || loading}
      sx={{
        borderRadius: '8px',
        px: 4,
        py: 1.2,
        fontWeight: 750,
        fontSize: '0.95rem',
        textTransform: 'none',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
        ...props.sx
      }}
      {...props}
    >
      {loading ? <CircularProgress size={22} color="inherit" /> : children}
    </Button>
  );
};
