import React, { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
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

  const todayStr = () => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const [startDate, setStartDate] = useState(() => localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr());
  const [loadingApps, setLoadingApps] = useState(true);

  const { applications } = useAppSelector(state => state.applications);

  // Sync date changes to localStorage
  useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`dashboard_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`dashboard_end_date_${currentUser.email}`, endDate);
    }
  }, [startDate, endDate, currentUser]);

  // Load applications from API so all sub-dashboards have access (Reuses Redux state on remount)
  useEffect(() => {
    let url = 'applications/?all_applicants=true';
    if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
    }

    const hasData = applications && applications.length > 0;
    if (hasData) {
      setLoadingApps(false);
      api.get(url).then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => {});
    } else {
      setLoadingApps(true);
      api.get(url).then((res: any) => {
        const list = res.data?.results ?? res.data ?? [];
        dispatch(setApplications(list));
      }).catch(() => {})
        .finally(() => setLoadingApps(false));
    }
  }, [dispatch, currentUser?.email, startDate, endDate]);

  return (
    <Box className="animate-fade-in">
      {loadingApps ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {(activeRole === 'ADMIN' || activeRole === 'CEO' || activeRole === 'REPORTING_TEAM') && (
            <AdminDashboard 
              readOnly={activeRole === 'REPORTING_TEAM'} 
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
            />
          )}
          {(activeRole === 'SENIOR_MANAGER' || activeRole === 'JUNIOR_MANAGER') && (
            <ManagerDashboard 
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
            />
          )}
          {(activeRole === 'TEAM_LEAD' || activeRole === 'SUB_LEAD') && (
            <LeadDashboard 
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
            />
          )}
          {activeRole === 'ASSOCIATE_ANALYST' && (
            <AssociateDashboard 
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
            />
          )}
        </>
      )}
    </Box>
  );
};

export default Dashboard;

