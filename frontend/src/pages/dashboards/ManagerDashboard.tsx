import React from 'react';
import { 
  Box, 
  Typography, 
  Button
} from '@mui/material';
import { useAppSelector } from '../../redux/store';
import { DashboardCalendar } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

interface ManagerDashboardProps {
  startDate: string;
  endDate: string;
  showAllTimeKPIs: boolean;
  setStartDate: (val: string) => void;
  setEndDate: (val: string) => void;
  setShowAllTimeKPIs: (val: boolean) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  startDate,
  endDate,
  showAllTimeKPIs,
  setStartDate,
  setEndDate,
  setShowAllTimeKPIs
}) => {
  const { user: currentUser } = useAppSelector(state => state.auth);





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
