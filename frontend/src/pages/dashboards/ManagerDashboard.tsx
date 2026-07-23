import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Button
} from '@mui/material';
import { useAppSelector, useAppDispatch } from '../../redux/store';
import { setApplications } from '../../redux/applicationsSlice';
import { api } from '../../services/api';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

export const ManagerDashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user: currentUser } = useAppSelector(state => state.auth);

  const [startDate, setStartDate] = useState(() => localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr());
  const [showAllTimeKPIs, setShowAllTimeKPIs] = useState(false);

  React.useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`dashboard_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`dashboard_end_date_${currentUser.email}`, endDate);
    }

    let url = 'applications/?all_applicants=true';
    if (!showAllTimeKPIs && startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    api.get(url).then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(() => {});
  }, [startDate, endDate, currentUser, showAllTimeKPIs, dispatch]);





  return (
    <Box>
      {/* Title block */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: -0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is the status of the teams reporting to you.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => setShowAllTimeKPIs(!showAllTimeKPIs)}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, py: 0.8 }}
          >
            {showAllTimeKPIs ? "All-Time KPIs Active" : "Show All-Time KPIs"}
          </Button>
          <DashboardCalendar
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </Box>
      </Box>


      {/* Hierarchy Report – starts from this Senior Manager's own node */}
      {currentUser && <HierarchyReport rootEmail={currentUser.email} startDate={showAllTimeKPIs ? '' : startDate} endDate={showAllTimeKPIs ? '' : endDate} />}



    </Box>
  );
};
