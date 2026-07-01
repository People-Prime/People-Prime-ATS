import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  CssBaseline,
  IconButton,
  Toolbar,
  Typography,
  useTheme,
  Button
} from '@mui/material';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  Briefcase,
  Award,
  ArrowLeft
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { logout } from '../redux/authSlice';
import { fetchUsersStart, fetchUsersSuccess } from '../redux/usersSlice';
import { setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';

interface MainLayoutProps {
  children: React.ReactNode;
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, themeMode, toggleTheme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const { user } = useAppSelector(state => state.auth);

  useEffect(() => {
    if (user) {
      dispatch(fetchUsersStart());
      api.get('users/').then(res => {
        const data = res.data?.results ?? res.data ?? [];
        const mappedUsers = data.map((u: any) => ({
          id: u.email,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          reporting_to: u.reporting_to,
          team: u.team,
          date_of_joining: u.date_of_joining || '',
          is_active: u.is_active !== undefined ? u.is_active : true,
          must_change_password: u.must_change_password || false
        }));
        dispatch(fetchUsersSuccess(mappedUsers));
      }).catch(() => {});

      api.get('applications/').then(res => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => {});
    }
  }, [dispatch, user]);

  const handleLogoutClick = () => {
    dispatch(logout());
    navigate('/login');
  };

  // Define navigation links based on user roles
  const getNavLinks = () => {
    const role = user?.role || 'ASSOCIATE_ANALYST';
    const links = [
      { text: 'Dashboard', icon: <LayoutDashboard size={16} />, path: '/' }
    ];

    // Admin has User Management
    if (role === 'ADMIN') {
      links.push({ text: 'User Management', icon: <Users size={16} />, path: '/users' });
    }

    // Senior Manager, Junior Manager, Team Lead, and ADMIN can manage teams
    if (['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(role)) {
      links.push({ text: 'Team Management', icon: <ShieldCheck size={16} />, path: '/teams' });
    }

    // Everyone except Admin has Applications
    if (role !== 'ADMIN') {
      links.push({ text: (role === 'TEAM_LEAD' || role === 'ASSOCIATE_ANALYST' || role === 'SENIOR_ANALYST' || role === 'CEO') ? 'Applicants' : 'Applications', icon: <FileSpreadsheet size={16} />, path: '/applications' });
      links.push({ text: 'Job Postings', icon: <Briefcase size={16} />, path: '/job-postings' });
      links.push({ text: 'Placements', icon: <Award size={16} />, path: '/placements' });
    }

    return links;
  };

  const menuItems = getNavLinks();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />

      {/* Header / Top Navigation */}
      <Box
        sx={{
          width: '100%',
          position: 'fixed',
          top: 0,
          right: 0,
          left: 0,
          zIndex: theme.zIndex.drawer + 2,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: '#001a4e',
          backdropFilter: 'blur(10px)',
          boxShadow: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <Toolbar sx={{ px: { xs: 2, sm: 4 }, minHeight: { xs: '68px', sm: '80px' }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left Side: Clickable Brand Logo Icon (Second Image) */}
          <IconButton
            onClick={() => navigate('/')}
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

          {/* Center: Navigation Options */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', px: 2, flexGrow: 1, '::-webkit-scrollbar': { display: 'none' } }}>
            {menuItems.map((item) => {
              const isSelected = location.pathname === item.path;
              return (
                <Button
                  key={item.text}
                  onClick={() => navigate(item.path)}
                  startIcon={item.icon}
                  sx={{
                    borderRadius: '24px',
                    py: 0.5,
                    px: 2,
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 700 : 500,
                    backgroundColor: isSelected ? '#ffffff' : 'transparent',
                    color: isSelected ? '#001a4e' : 'rgba(255, 255, 255, 0.8)',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    textTransform: 'none',
                    '&:hover': {
                      backgroundColor: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                      color: isSelected ? '#001a4e' : '#ffffff',
                    }
                  }}
                >
                  {item.text}
                </Button>
              );
            })}
          </Box>

          {/* Action Tools: User info, Theme toggle, Hamburger menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 } }}>
            {/* User Info (Left of Theme Option) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 650, color: 'rgba(255, 255, 255, 0.9)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, letterSpacing: 0.2 }}>
                {user?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} - {user?.role === 'CEO' ? 'CEO' : user?.role?.replace('_', ' ').toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Typography>
            </Box>

            {/* Logout Button */}
            <IconButton
              onClick={handleLogoutClick}
              title="Logout"
              sx={{
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '10px',
                p: 1.25,
                color: '#EF4444',
                '&:hover': {
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.8)',
                }
              }}
            >
              <LogOut size={20} />
            </IconButton>

            {/* Light/Dark Toggle */}
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
          </Box>
        </Toolbar>
      </Box>

      {/* Main Panel Viewport */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: '100%',
          ml: 0,
          minHeight: '100vh',
          pt: { xs: '84px', sm: '96px' },
          backgroundColor: 'background.default',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {location.pathname !== '/' && (
          <Box sx={{ mb: 2, display: 'flex' }}>
            <Button
              startIcon={<ArrowLeft size={16} />}
              onClick={() => navigate(-1)}
              sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'none', '&:hover': { color: 'primary.main' } }}
            >
              Back
            </Button>
          </Box>
        )}
        {children}
      </Box>
    </Box>
  );
};
