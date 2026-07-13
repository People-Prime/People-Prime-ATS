import React, { useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { getAppTheme } from './theme';
import { useAppSelector } from './redux/store';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { UserManagement } from './pages/UserManagement';
import { CreateEditUser } from './pages/CreateEditUser';
import { TeamManagement } from './pages/TeamManagement';
import { Applications } from './pages/Applications';
import { OrgHierarchy } from './pages/OrgHierarchy';
import { CreateRequirement } from './pages/CreateRequirement';
import { CreateCandidate } from './pages/CreateCandidate';
import { CandidateDetails } from './pages/CandidateDetails';
import { ViewCandidates } from './pages/ViewCandidates';
import { JobPostings } from './pages/JobPostings';
import { Placements } from './pages/Placements';
import { DrillDownPage } from './pages/dashboards/DrillDownPage';

// Helper component for Route Protection
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAppSelector(state => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Handle first-login password change constraint
  if (user?.must_change_password) {
    // Simply render password reset, but for demo we can redirect or show warning
  }

  // Role validation
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // If not authorized, redirect to home dashboard
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  // Theme state configuration (default to dark mode for rich aesthetics)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('ats-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('ats-theme', next);
      
      // Update HTML attribute for CSS variables adaptation
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  };

  // Memoize theme compilation
  const theme = useMemo(() => getAppTheme(themeMode), [themeMode]);

  // Set default theme attribute on load
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public Portal */}
          <Route path="/login" element={<Login themeMode={themeMode} toggleTheme={toggleTheme} />} />

          {/* Secure Platform Console */}
          <Route 
            path="/*" 
            element={
              <ProtectedRoute>
                <MainLayout themeMode={themeMode} toggleTheme={toggleTheme}>
                  <Routes>
                    {/* Role Adaptive Dashboards */}
                    <Route path="/" element={<Dashboard />} />
                    
                    {/* User accounts directory (Admin only) */}
                    <Route 
                      path="/users" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN']}>
                          <UserManagement />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/users/create" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN']}>
                          <CreateEditUser />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/users/edit/:userId" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN']}>
                          <CreateEditUser />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Teams config (CEO, Managers) */}
                    <Route 
                      path="/teams" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN', 'CEO', 'SENIOR_MANAGER', 'JUNIOR_MANAGER']}>
                          <TeamManagement />
                        </ProtectedRoute>
                      } 
                    />
                    
                    <Route 
                      path="/applications" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN', 'CEO', 'SENIOR_MANAGER', 'JUNIOR_MANAGER', 'TEAM_LEAD', 'ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'SUB_LEAD', 'REPORTING_TEAM']}>
                          <Applications />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/job-postings" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN', 'CEO', 'SENIOR_MANAGER', 'JUNIOR_MANAGER', 'TEAM_LEAD', 'ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'SUB_LEAD', 'REPORTING_TEAM']}>
                          <JobPostings />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/placements" 
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN', 'CEO', 'SENIOR_MANAGER', 'JUNIOR_MANAGER', 'TEAM_LEAD', 'ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'SUB_LEAD', 'REPORTING_TEAM']}>
                          <Placements />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/applications/create" 
                      element={
                        <ProtectedRoute allowedRoles={['TEAM_LEAD', 'SUB_LEAD']}>
                          <CreateRequirement />
                        </ProtectedRoute>
                      } 
                    />
                    <Route 
                      path="/applications/create/:applicationId" 
                      element={
                        <ProtectedRoute allowedRoles={['TEAM_LEAD', 'SUB_LEAD']}>
                          <CreateRequirement />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/candidates/create" 
                      element={
                        <ProtectedRoute allowedRoles={['ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'TEAM_LEAD', 'SUB_LEAD']}>
                          <CreateCandidate />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/candidates/create/:applicationId" 
                      element={
                        <ProtectedRoute allowedRoles={['ASSOCIATE_ANALYST', 'SENIOR_ANALYST', 'TEAM_LEAD', 'SUB_LEAD']}>
                          <CreateCandidate />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/candidates/:applicationId/details" 
                      element={
                        <ProtectedRoute>
                          <CandidateDetails />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/applications/:applicationId/candidates" 
                      element={
                        <ProtectedRoute>
                          <ViewCandidates />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Org structure chart */}
                    <Route 
                      path="/hierarchy" 
                      element={
                        <ProtectedRoute allowedRoles={['CEO']}>
                          <OrgHierarchy />
                        </ProtectedRoute>
                      } 
                    />

                    <Route 
                      path="/drill-down" 
                      element={
                        <ProtectedRoute>
                          <DrillDownPage />
                        </ProtectedRoute>
                      } 
                    />

                    {/* Fallback routing */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App;
