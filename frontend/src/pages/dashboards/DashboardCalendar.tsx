import React, { useRef } from 'react';
import { Box, Tooltip, IconButton, useTheme } from '@mui/material';
import { CalendarDays, X } from 'lucide-react';

interface DashboardCalendarProps {
  selectedDate: string;           // ISO date string "YYYY-MM-DD"
  onChange: (date: string) => void;
  totalCount: number;             // count of matching records for selected date
  allCount: number;               // count when no date filter is applied
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
  selectedDate,
  onChange,
  totalCount,
  allCount
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFilter = selectedDate !== todayStr() && Boolean(selectedDate);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, position: 'relative' }}>
      {/* Hidden native date input positioned relative to wrapper to anchor showPicker() correctly */}
      <input
        type="date"
        ref={inputRef}
        value={selectedDate}
        max={todayStr()}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const val = e.target.value;
          if (val && val > todayStr()) {
            onChange(todayStr());
          } else {
            onChange(val || todayStr());
          }
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '32px',
          height: '32px',
          opacity: 0,
          pointerEvents: 'none',
          border: 'none',
          padding: 0,
          margin: 0
        }}
      />

      {/* Visible icon button */}
      <Tooltip title={hasFilter ? `Filtered: ${selectedDate} (${totalCount}/${allCount}) — Click to change` : 'Filter by date (showing today by default)'}>
        <IconButton
          size="small"
          onClick={() => {
            if (inputRef.current) {
              if (typeof inputRef.current.showPicker === 'function') {
                inputRef.current.showPicker();
              } else {
                inputRef.current.click();
              }
            }
          }}
          sx={{
            borderRadius: '10px',
            p: 0.75,
            bgcolor: hasFilter
              ? isDark ? 'rgba(99,102,241,0.25)' : '#e0e7ff'
              : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            border: hasFilter
              ? `1.5px solid ${isDark ? 'rgba(99,102,241,0.5)' : '#c7d2fe'}`
              : `1.5px solid transparent`,
            color: hasFilter ? 'primary.main' : 'text.secondary',
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: isDark ? 'rgba(99,102,241,0.35)' : '#c7d2fe',
              color: 'primary.main',
              border: `1.5px solid ${isDark ? 'rgba(99,102,241,0.5)' : '#c7d2fe'}`,
            },
          }}
        >
          <CalendarDays size={18} />
        </IconButton>
      </Tooltip>

      {/* Clear Button (resets back to today) */}
      {hasFilter && (
        <Tooltip title={`Reset to Today's date`}>
          <IconButton
            size="small"
            onClick={() => onChange(todayStr())}
            sx={{
              borderRadius: '50%',
              p: 0.5,
              color: 'error.main',
              bgcolor: isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isDark ? 'rgba(239,68,68,0.25)' : '#fca5a5',
              },
            }}
          >
            <X size={14} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};
