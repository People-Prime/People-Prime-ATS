import { createTheme } from '@mui/material/styles';

export const getAppTheme = (mode: 'light' | 'dark') => {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'light' ? '#001a4e' : '#3b82f6', // Deep navy for light mode
        dark: mode === 'light' ? '#000f2e' : '#1d4ed8',
        light: mode === 'light' ? '#e0f2fe' : '#1e1b4b',
        contrastText: '#ffffff',
      },
      secondary: {
        main: mode === 'light' ? '#0d9488' : '#14b8a6', // Teal
        dark: mode === 'light' ? '#115e59' : '#0f766e',
        light: mode === 'light' ? '#ccfbf1' : '#112927',
        contrastText: '#ffffff',
      },
      background: {
        default: mode === 'light' ? '#f3f4f6' : '#090d16',
        paper: mode === 'light' ? '#ffffff' : '#111827',
      },
      text: {
        primary: mode === 'light' ? '#0f172a' : '#f8fafc',
        secondary: mode === 'light' ? '#475569' : '#cbd5e1',
        disabled: mode === 'light' ? '#94a3b8' : '#64748b',
      },
      divider: mode === 'light' ? '#e2e8f0' : '#1f2937',
      success: {
        main: '#10b981',
        contrastText: '#ffffff',
      },
      error: {
        main: '#ef4444',
      },
      warning: {
        main: '#f59e0b',
        contrastText: '#ffffff',
      },
      info: {
        main: '#06b6d4',
      },
    },
    typography: {
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      h1: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 700,
      },
      h2: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 700,
      },
      h3: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 600,
      },
      h4: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 800,
        fontSize: '1.5rem',
      },
      h5: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 800,
        fontSize: '1.5rem',
      },
      h6: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 600,
      },
      button: {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 600,
        textTransform: 'none',
      },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '0.875rem',
            transition: 'all 0.2s ease-in-out',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              transform: 'translateY(-1px)',
            },
          },
          containedPrimary: {
            '&:hover': {
              backgroundColor: mode === 'light' ? '#4338ca' : '#4f46e5',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: '16px',
            border: `1px solid ${mode === 'light' ? '#f1f5f9' : '#1f2937'}`,
            boxShadow: mode === 'light' ? '0 4px 6px -1px rgba(15, 23, 42, 0.03), 0 2px 4px -2px rgba(15, 23, 42, 0.03)' : '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${mode === 'light' ? '#e2e8f0' : '#1f2937'}`,
            backgroundColor: mode === 'light' ? '#ffffff' : '#0b0f19',
          },
        },
      },
    },
  });
};
