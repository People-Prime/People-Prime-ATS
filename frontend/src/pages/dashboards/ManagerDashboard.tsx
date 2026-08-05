import React from 'react';
import { 
  Box, 
  Typography
} from '@mui/material';
import { useAppSelector } from '../../redux/store';
import { DashboardCalendar } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

interface ManagerDashboardProps {
  startDate: string;
  endDate: string;
  setStartDate: (val: string) => void;
  setEndDate: (val: string) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ 
  startDate,
  endDate,
  setStartDate,
  setEndDate
}) => {
  const { user: currentUser } = useAppSelector(state => state.auth);

  return (
    <Box className="animate-fade-in">
      {/* Header Greeting Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
            Welcome Back, {currentUser?.full_name?.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Here is the status of the teams reporting to you.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
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

      {/* Reporting Hierarchy Breakdown starting from this Manager */}
      {currentUser && <HierarchyReport rootEmail={currentUser.email} startDate={startDate} endDate={endDate} />}
    </Box>
  );
};
