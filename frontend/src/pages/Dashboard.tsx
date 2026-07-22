import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../redux/store';
import { setApplications } from '../redux/applicationsSlice';
import { api } from '../services/api';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { LeadDashboard } from './dashboards/LeadDashboard';
import { AssociateDashboard } from './dashboards/AssociateDashboard';
import { ManagerDashboard } from './dashboards/ManagerDashboard';

export const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { applications } = useAppSelector(state => state.applications);
  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  // Load applications from API so all sub-dashboards have access
  useEffect(() => {
    if (applications.length === 0) {
      api.get('applications/?all_applicants=true').then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => {});
    }
  }, [dispatch, applications.length]);

  return (
    <Box className="animate-fade-in">
      {(activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'REPORTING_TEAM') && (
        <AdminDashboard readOnly={activeRole === 'REPORTING_TEAM'} />
      )}
      {(activeRole === 'SENIOR_MANAGER' || activeRole === 'JUNIOR_MANAGER') && <ManagerDashboard />}
      {(activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD') && <LeadDashboard />}
      {activeRole === 'ASSOCIATE_ANALYST' && <AssociateDashboard />}
    </Box>
  );
};

export default Dashboard;
