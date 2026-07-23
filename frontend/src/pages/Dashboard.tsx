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
  const activeRole = currentUser?.role || 'ASSOCIATE_ANALYST';

  // Load applications from API so all sub-dashboards have access
  useEffect(() => {
    const todayStr = () => {
      const d = new Date();
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };
    const start = localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr();
    const end = localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr();

    let url = 'applications/?all_applicants=true';
    if (start && end) {
      url += `&start_date=${start}&end_date=${end}`;
    }

    api.get(url).then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(() => {});
  }, [dispatch, currentUser?.email]);

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
