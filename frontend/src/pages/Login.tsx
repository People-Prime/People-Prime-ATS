import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  Alert,
  Toolbar,
  useTheme
} from '@mui/material';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Moon
} from 'lucide-react';
import { useAppDispatch } from '../redux/store';
import { loginUser } from '../redux/authSlice';

interface LoginProps {
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Login: React.FC<LoginProps> = ({ themeMode, toggleTheme }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const isDark = themeMode === 'dark';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    dispatch(loginUser({ email, password }))
      .unwrap()
      .then(() => {
        navigate('/');
      })
      .catch((err: any) => {
        setError(err || 'Failed to authenticate.');
      });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark
          ? 'linear-gradient(135deg, #090d16 0%, #0b1528 50%, #001a4e 100%)'
          : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
        pt: { xs: 10, sm: 12 },
        pb: { xs: 4, sm: 6 },
        px: 2,
        position: 'relative',
        transition: 'background 0.3s ease'
      }}
    >
      <style>{`
        @keyframes radar-spin-animation {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float-radar-doc-1-animation {
          0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; }
          100% { transform: translate(95px, 50px) scale(0.6); opacity: 0; }
        }
        @keyframes float-radar-doc-2-animation {
          0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; }
          100% { transform: translate(-85px, -50px) scale(0.6); opacity: 0; }
        }
        @keyframes funnel-fall-animation {
          0% { transform: translateY(-50px); opacity: 0; }
          15% { opacity: 1; }
          45% { transform: translateY(70px); opacity: 1; }
          80% { transform: translateY(110px); opacity: 0.2; }
          100% { transform: translateY(140px); opacity: 0; }
        }
        @keyframes paper-lift-animation {
          0% { transform: translateY(10px); }
          50% { transform: translateY(-12px); }
          100% { transform: translateY(10px); }
        }
        @keyframes folder-bob-animation {
          0% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
          100% { transform: translateY(0); }
        }
        .radar-sweep-line {
          transform-origin: 225px 140px;
          animation: radar-spin-animation 6s infinite linear;
        }
        .radar-doc-float-1 {
          animation: float-radar-doc-1-animation 4.5s infinite linear;
        }
        .radar-doc-float-2 {
          animation: float-radar-doc-2-animation 4.5s infinite linear 2.2s;
        }
        .funnel-bubble-fall-1 {
          animation: funnel-fall-animation 4s infinite ease-in;
        }
        .funnel-bubble-fall-2 {
          animation: funnel-fall-animation 4s infinite ease-in 1.3s;
        }
        .funnel-bubble-fall-3 {
          animation: funnel-fall-animation 4s infinite ease-in 2.6s;
        }
        .folder-bobbing-1 {
          animation: folder-bob-animation 3.5s infinite ease-in-out;
        }
        .folder-bobbing-2 {
          animation: folder-bob-animation 3.5s infinite ease-in-out 1.1s;
        }
        .folder-bobbing-3 {
          animation: folder-bob-animation 3.5s infinite ease-in-out 2.2s;
        }
        .paper-sliding {
          animation: paper-lift-animation 4s infinite ease-in-out;
        }
      `}</style>

      {/* Header / Top Navigation (Persistent Dark Theme) */}
      <Box
        sx={{
          width: '100%',
          position: 'fixed',
          top: 0,
          right: 0,
          left: 0,
          zIndex: theme.zIndex.drawer + 2,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: '#001a4eDA',
          backdropFilter: 'blur(10px)',
          boxShadow: 'none'
        }}
      >
        <Toolbar sx={{ px: { xs: 2, sm: 4 }, minHeight: { xs: '68px', sm: '80px' }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left Side: Clickable Brand Logo Icon */}
          <IconButton
            onClick={() => navigate('/login')}
            sx={{
              p: 0,
              borderRadius: '10px',
              transition: 'transform 0.2s ease',
              '&:hover': {
                transform: 'scale(1.05)',
                backgroundColor: 'transparent'
              }
            }}
          >
            <Box
              component="img"
              src="/logo.png"
              alt="People Prime Worldwide"
              sx={{
                height: { xs: 36, sm: 46 },
                width: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
          </IconButton>

          {/* Right Side: Light/Dark Toggle */}
          <IconButton
            onClick={toggleTheme}
            sx={{
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              p: 1.25,
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)'
              }
            }}
          >
            {themeMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </IconButton>
        </Toolbar>
      </Box>

      {/* 2-Column Responsive Layout */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 4, md: 8 },
        width: '100%',
        maxWidth: 1050,
        zIndex: 1,
        mt: { xs: 2, md: 4 }
      }}>
        {/* Left Column: Ceipal-inspired ATS Feature Animation Carousel (No Text) */}
        <Box sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1.2,
          p: 2
        }}>
          <Box sx={{ minHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {activeSlide === 0 && (
              <svg width="450" height="300" viewBox="0 0 450 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Radar target rings */}
                <circle cx="225" cy="145" r="110" stroke={isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(0, 26, 78, 0.08)"} strokeWidth="1.5" />
                <circle cx="225" cy="145" r="75" stroke={isDark ? "rgba(59, 130, 246, 0.25)" : "rgba(0, 26, 78, 0.12)"} strokeWidth="1.5" />
                <circle cx="225" cy="145" r="30" stroke="#3b82f6" strokeWidth="2" />

                {/* Radar sweep lines */}
                <g className="radar-sweep-line" style={{ transformOrigin: '225px 145px' }}>
                  <line x1="225" y1="145" x2="335" y2="145" stroke="#60a5fa" strokeWidth="2.5" />
                  <polygon points="225,145 335,120 335,145" fill="url(#radarGrad)" opacity="0.4" />
                </g>

                {/* Documents floating into radar center */}
                <g className="radar-doc-float-1" style={{ transformOrigin: '120px 80px' }}>
                  <rect x="105" y="60" width="32" height="42" rx="4" fill={isDark ? "#1e293b" : "#ffffff"} stroke="#3b82f6" strokeWidth="1.5" />
                  <line x1="111" y1="70" x2="131" y2="70" stroke="#3b82f6" strokeWidth="2" />
                  <line x1="111" y1="78" x2="131" y2="78" stroke="#cbd5e1" strokeWidth="2" />
                  <line x1="111" y1="86" x2="123" y2="86" stroke="#cbd5e1" strokeWidth="2" />
                </g>

                <g className="radar-doc-float-2" style={{ transformOrigin: '320px 200px' }}>
                  <rect x="305" y="180" width="32" height="42" rx="4" fill={isDark ? "#1e293b" : "#ffffff"} stroke="#10b981" strokeWidth="1.5" />
                  <path d="M 314 200 L 319 205 L 328 195" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>

                <defs>
                  <linearGradient id="radarGrad" x1="225" y1="145" x2="335" y2="145" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="1" />
                  </linearGradient>
                </defs>
              </svg>
            )}

            {activeSlide === 1 && (
              <svg width="450" height="300" viewBox="0 0 450 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Funnel Outline */}
                <path d="M 160 50 L 290 50 L 255 130 L 255 210 L 195 210 L 195 130 Z" stroke={isDark ? "#475569" : "#94a3b8"} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                
                {/* Candidate nodes falling into funnel */}
                <g className="funnel-bubble-fall-1" style={{ transformOrigin: '225px 40px' }}>
                  <circle cx="225" cy="40" r="14" fill={isDark ? "#1e293b" : "#ffffff"} stroke="#3b82f6" strokeWidth="2" />
                  <circle cx="225" cy="36" r="4.5" fill="#3b82f6" />
                  <path d="M 218 47 C 218 43 221 41 225 41 C 229 41 232 43 232 47 Z" fill="#3b82f6" />
                </g>
                <g className="funnel-bubble-fall-2" style={{ transformOrigin: '210px 40px' }}>
                  <circle cx="210" cy="40" r="12" fill={isDark ? "#1e293b" : "#ffffff"} stroke="#a78bfa" strokeWidth="2" />
                  <circle cx="210" cy="36" r="4" fill="#a78bfa" />
                  <path d="M 204 45 C 204 42 207 40 210 40 C 213 40 216 42 216 45 Z" fill="#a78bfa" />
                </g>
                <g className="funnel-bubble-fall-3" style={{ transformOrigin: '240px 40px' }}>
                  <circle cx="240" cy="40" r="13" fill={isDark ? "#1e293b" : "#ffffff"} stroke="#f59e0b" strokeWidth="2" />
                  <circle cx="240" cy="36" r="4" fill="#f59e0b" />
                  <path d="M 234 46 C 234 43 237 41 240 41 C 243 41 246 43 246 46 Z" fill="#f59e0b" />
                </g>

                {/* Filtered outputs flowing down */}
                <g style={{ transform: 'translateY(120px)' }} className="funnel-bubble-fall-1">
                  <circle cx="225" cy="50" r="14" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="2" />
                  <path d="M 218 48 L 222 52 L 230 44" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            )}

            {activeSlide === 2 && (
              <svg width="450" height="300" viewBox="0 0 450 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Folder 1 (Blue) */}
                <g className="folder-bobbing-1" style={{ transformOrigin: '110px 150px' }}>
                  <rect x="95" y="115" width="30" height="40" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" className="paper-sliding" />
                  <path d="M 80 130 L 96 130 L 102 136 L 124 136 L 124 174 L 80 174 Z" fill={isDark ? "#1d4ed8" : "#2563eb"} opacity="0.9" />
                  <path d="M 80 137 L 124 137 L 120 174 L 76 174 Z" fill={isDark ? "#3b82f6" : "#60a5fa"} />
                </g>

                {/* Folder 2 (Purple) */}
                <g className="folder-bobbing-2" style={{ transformOrigin: '225px 150px' }}>
                  <rect x="210" y="115" width="30" height="40" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" className="paper-sliding" />
                  <path d="M 195 130 L 211 130 L 217 136 L 239 136 L 239 174 L 195 174 Z" fill={isDark ? "#6d28d9" : "#7c3aed"} opacity="0.9" />
                  <path d="M 195 137 L 239 137 L 235 174 L 191 174 Z" fill={isDark ? "#a855f7" : "#c084fc"} />
                </g>

                {/* Folder 3 (Green) */}
                <g className="folder-bobbing-3" style={{ transformOrigin: '340px 150px' }}>
                  <rect x="325" y="115" width="30" height="40" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" className="paper-sliding" />
                  <path d="M 310 130 L 326 130 L 332 136 L 354 136 L 354 174 L 310 174 Z" fill={isDark ? "#065f46" : "#059669"} opacity="0.9" />
                  <path d="M 310 137 L 354 137 L 350 174 L 306 174 Z" fill={isDark ? "#10b981" : "#34d399"} />
                </g>
              </svg>
            )}
          </Box>

          {/* Slide Text Content */}
          <Box sx={{ textAlign: 'center', mt: 1, minHeight: 90, px: 4 }}>
            {activeSlide === 0 && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700, color: isDark ? 'white' : 'text.primary', mb: 1 }}>
                  AI-Powered Candidate Matching
                </Typography>
                <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary', maxWidth: 360, margin: '0 auto', fontSize: '0.85rem' }}>
                  Automatically scan, parse, and match candidate resumes to open requirements using our intelligent radar matching algorithm.
                </Typography>
              </>
            )}
            {activeSlide === 1 && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700, color: isDark ? 'white' : 'text.primary', mb: 1 }}>
                  Streamlined Recruitment Pipelines
                </Typography>
                <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary', maxWidth: 360, margin: '0 auto', fontSize: '0.85rem' }}>
                  Track candidates effortlessly through stages from initial sourcing to screening, lead approval, and final client placements.
                </Typography>
              </>
            )}
            {activeSlide === 2 && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700, color: isDark ? 'white' : 'text.primary', mb: 1 }}>
                  Centralized Document Folders
                </Typography>
                <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary', maxWidth: 360, margin: '0 auto', fontSize: '0.85rem' }}>
                  Keep all profiles, resumes, and client documents organized in secure folders matching specific Job Codes and requirements.
                </Typography>
              </>
            )}
          </Box>

          {/* Carousel indicators dots */}
          <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
            {[0, 1, 2].map((idx) => (
              <Box
                key={idx}
                onClick={() => setActiveSlide(idx)}
                sx={{
                  width: idx === activeSlide ? 32 : 10,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: idx === activeSlide ? 'primary.main' : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Right Column: Card */}
        <Box sx={{ flex: 0.9, display: 'flex', justifyContent: 'center', width: '100%' }}>
          <Card
            className="animate-fade-in"
            sx={{
              maxWidth: 420,
              width: '100%',
              borderRadius: '24px',
              boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.4)' : '0 20px 40px rgba(0,0,0,0.08)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              backdropFilter: 'blur(10px)',
              bgcolor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
              transition: 'all 0.3s ease',
              mt: 0
            }}
          >
            <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
              {/* Header Brand */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, textAlign: 'center' }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    color: isDark ? 'white' : 'text.primary',
                    letterSpacing: -0.5,
                    mb: 1
                  }}
                >
                  People Prime ATS
                </Typography>
                <Typography variant="body2" sx={{ color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary' }}>
                  Sign in to manage team pipelines
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <TextField
                    fullWidth
                    variant="outlined"
                    label="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                          <Mail size={18} />
                        </InputAdornment>
                      ),
                      style: { color: isDark ? 'white' : theme.palette.text.primary }
                    }}
                    InputLabelProps={{
                      style: { color: isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.secondary }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)' },
                        '&:hover fieldset': { borderColor: 'primary.main' },
                        '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                      },
                      '& .MuiInputLabel-root': {
                        color: isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.secondary,
                        '&.Mui-focused': {
                          color: 'primary.main'
                        }
                      }
                    }}
                  />

                  <TextField
                    fullWidth
                    variant="outlined"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}

                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                          <Lock size={18} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            sx={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                      style: { color: isDark ? 'white' : theme.palette.text.primary }
                    }}
                    InputLabelProps={{
                      style: { color: isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.secondary }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)' },
                        '&:hover fieldset': { borderColor: 'primary.main' },
                        '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                      },
                      '& .MuiInputLabel-root': {
                        color: isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.secondary,
                        '&.Mui-focused': {
                          color: 'primary.main'
                        }
                      }
                    }}
                  />

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    type="submit"
                    sx={{
                      py: 1.5,
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #001a4e 0%, #0d9488 100%)',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      boxShadow: '0 8px 24px rgba(0, 26, 78, 0.25)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #000f2e 0%, #0f766e 100%)',
                      }
                    }}
                  >
                    Sign In
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};
