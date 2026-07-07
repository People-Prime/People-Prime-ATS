import React, { useRef } from 'react';
import { Box, TextField, IconButton, Tooltip } from '@mui/material';
import { CalendarDays } from 'lucide-react';

interface DashboardCalendarProps {
  startDate: string;              // ISO date string "YYYY-MM-DD"
  endDate: string;                // ISO date string "YYYY-MM-DD"
  onChange: (start: string, end: string) => void;
  totalCount?: number;            // count of matching records for range
  allCount?: number;              // count when no filter is applied
  selectedDate?: string;          // backward compatibility
}

/** Returns today's date as "YYYY-MM-DD" in local time */
export const todayStr = (): string => {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

export const DashboardCalendar: React.FC<DashboardCalendarProps> = ({
  startDate,
  endDate,
  onChange
}) => {
  const singleDateInputRef = useRef<HTMLInputElement>(null);

  const handleSingleDateIconClick = () => {
    if (singleDateInputRef.current) {
      if (typeof singleDateInputRef.current.showPicker === 'function') {
        singleDateInputRef.current.showPicker();
      } else {
        singleDateInputRef.current.click();
      }
    }
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, position: 'relative' }}>
      <TextField
        label="From Date"
        type="date"
        size="small"
        value={startDate || todayStr()}
        onChange={(e) => onChange(e.target.value, endDate || todayStr())}
        InputLabelProps={{ shrink: true }}
        sx={{ 
          width: 140,
          '& .MuiInputBase-input': { padding: '6px 8px', fontSize: '0.75rem' },
          '& .MuiInputLabel-root': { fontSize: '0.75rem' }
        }}
      />
      
      {/* Hidden single date selector input */}
      <input
        type="date"
        ref={singleDateInputRef}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            onChange(val, val);
          }
        }}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0
        }}
      />

      <Tooltip title="Choose a single date for both From/To">
        <IconButton 
          size="small" 
          onClick={handleSingleDateIconClick}
          sx={{ 
            color: 'primary.main',
            p: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px',
            bgcolor: 'action.hover'
          }}
        >
          <CalendarDays size={16} />
        </IconButton>
      </Tooltip>

      <TextField
        label="To Date"
        type="date"
        size="small"
        value={endDate || todayStr()}
        onChange={(e) => onChange(startDate || todayStr(), e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ 
          width: 140,
          '& .MuiInputBase-input': { padding: '6px 8px', fontSize: '0.75rem' },
          '& .MuiInputLabel-root': { fontSize: '0.75rem' }
        }}
      />
    </Box>
  );
};
