import React, { useState } from 'react';
import { Box, Typography, Popover, IconButton, Chip } from '@mui/material';
import { X } from 'lucide-react';

interface ExpandableSkillsProps {
  skills: string | string[] | null | undefined;
}

/**
 * Parses raw skills input (comma-separated string, JSON array string, or array)
 * into a clean list of non-empty skill strings while preserving order.
 */
export const parseSkills = (rawSkills: string | string[] | null | undefined): string[] => {
  if (!rawSkills) return [];

  if (Array.isArray(rawSkills)) {
    return rawSkills
      .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
      .filter((s) => s.length > 0);
  }

  if (typeof rawSkills === 'string') {
    const trimmed = rawSkills.trim();
    if (!trimmed) return [];

    // Attempt JSON parse in case it's a serialized array like '["Python", "Django"]'
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
            .filter((s) => s.length > 0);
        }
      } catch {
        // Fall back to standard comma splitting if JSON parse fails
      }
    }

    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return [];
};

export const ExpandableSkills: React.FC<ExpandableSkillsProps> = ({ skills }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const skillList = parseSkills(skills);

  if (skillList.length === 0) {
    return (
      <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
        N/A
      </Typography>
    );
  }

  const hasMore = skillList.length > 3;
  const displayedSkills = hasMore ? skillList.slice(0, 3) : skillList;
  const displayedText = displayedSkills.join(', ');

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = (event?: any) => {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? 'expandable-skills-popover' : undefined;

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', maxWidth: '100%' }}>
      <Typography
        component="span"
        sx={{
          fontSize: '0.7rem',
          color: 'text.primary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={hasMore ? undefined : displayedText}
      >
        {displayedText}
      </Typography>

      {hasMore && (
        <>
          <Typography
            component="span"
            aria-describedby={id}
            onClick={handleOpen}
            sx={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'primary.main',
              cursor: 'pointer',
              ml: 0.5,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            ...more
          </Typography>

          <Popover
            id={id}
            open={open}
            anchorEl={anchorEl}
            onClose={handleClose}
            onClick={(e) => e.stopPropagation()}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
            slotProps={{
              paper: {
                sx: {
                  p: 1.5,
                  maxWidth: 380,
                  maxHeight: 320,
                  boxShadow: 4,
                  borderRadius: 2,
                  zIndex: 1300,
                },
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'text.primary' }}>
                Complete Primary Skills ({skillList.length})
              </Typography>
              <IconButton size="small" onClick={handleClose} aria-label="close" sx={{ p: 0.25, ml: 1 }}>
                <X size={14} />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, pt: 0.5, maxHeight: 240, overflowY: 'auto' }}>
              {skillList.map((skill, index) => (
                <Chip
                  key={`${skill}-${index}`}
                  label={skill}
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    height: 22,
                    bgcolor: 'action.hover',
                    fontWeight: 500,
                  }}
                />
              ))}
            </Box>
          </Popover>
        </>
      )}
    </Box>
  );
};
