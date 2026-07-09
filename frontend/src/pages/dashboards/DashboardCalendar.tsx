import React, { useRef, useState, useEffect } from 'react';
import { Box, TextField, IconButton, Tooltip, Button } from '@mui/material';
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

  const [localStart, setLocalStart] = useState(startDate || todayStr());
  const [localEnd, setLocalEnd] = useState(endDate || todayStr());

  // Keep local state in sync when parent props change
  useEffect(() => {
    setLocalStart(startDate || todayStr());
    setLocalEnd(endDate || todayStr());
  }, [startDate, endDate]);

  const handleSingleDateIconClick = () => {
    if (singleDateInputRef.current) {
      if (typeof singleDateInputRef.current.showPicker === 'function') {
        singleDateInputRef.current.showPicker();
      } else {
        singleDateInputRef.current.click();
      }
    }
  };

  const handleConfirm = () => {
    onChange(localStart, localEnd);
  };

  const maxDate = todayStr();

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, position: 'relative' }}>
      <TextField
        label="From Date"
        type="date"
        size="small"
        value={localStart}
        onChange={(e) => setLocalStart(e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: maxDate }}
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
        max={maxDate}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            setLocalStart(val);
            setLocalEnd(val);
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
        value={localEnd}
        onChange={(e) => setLocalEnd(e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: maxDate }}
        sx={{ 
          width: 140,
          '& .MuiInputBase-input': { padding: '6px 8px', fontSize: '0.75rem' },
          '& .MuiInputLabel-root': { fontSize: '0.75rem' }
        }}
      />

      <Button
        variant="contained"
        size="small"
        onClick={handleConfirm}
        sx={{
          height: '32px',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'none',
          borderRadius: '8px',
          px: 1.5
        }}
      >
        OK
      </Button>
    </Box>
  );
};
