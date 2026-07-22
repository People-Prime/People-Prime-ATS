import React from 'react';
import { todayStr } from './DashboardCalendar';
import {
  Grid,
  Card,
  Typography,
  useTheme,
  Box
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../redux/store';
import {
  Send,
  CalendarClock,
  ThumbsDown,
  MailCheck,
  BadgeCheck,
  Briefcase
} from 'lucide-react';

export const getUniqueSubmissions = (apps: any[]) => {
  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    const cleanVal = value && value !== '' ? value : 'N/A';
    if (fieldName === 'Job Code' && cleanVal !== 'N/A') {
      if (!cleanVal.toUpperCase().startsWith('PPW')) {
        return 'N/A';
      }
    }
    return cleanVal;
  };

  const candidateGroups: Record<string, any[]> = {};
  apps.forEach(app => {
    if (!app.candidate_name) return;
    const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
    if (!candidateGroups[key]) {
      candidateGroups[key] = [];
    }
    candidateGroups[key].push(app);
  });

  const uniqueApps: any[] = [];
  apps.forEach(app => {
    if (!app.candidate_name) {
      uniqueApps.push(app);
      return;
    }
    const key = app.candidate_email?.toLowerCase().trim() || app.candidate_name?.toLowerCase().trim();
    const group = candidateGroups[key] || [];
    const hasRealJob = group.some(a => getRemarkFieldVal(a.remarks, 'Job Code') !== 'N/A');
    if (hasRealJob) {
      if (getRemarkFieldVal(app.remarks, 'Job Code') !== 'N/A') {
        uniqueApps.push(app);
      }
    } else {
      if (app.id === group[0].id) {
        uniqueApps.push(app);
      }
    }
  });

  return uniqueApps;
};

export const hasReachedSubmittedMilestone = (app: any): boolean => {
  const postSubmissionStatuses = [
    'Submitted',
    'Under Review',
    'Interview Scheduled',
    'Interview Completed',
    'Selected',
    'Offer Sent',
    'Offer Accepted',
    'Placed'
  ];
  if (postSubmissionStatuses.includes(app.status)) {
    return true;
  }

  if (app.notes && Array.isArray(app.notes)) {
    return app.notes.some((note: any) => {
      const content = (note.content || '').toLowerCase();
      return content.includes('submitted') || content.includes('sourced');
    });
  }

  return false;
};

export const getPlacedAppsWithCodes = (allApplications: any[]) => {
  const uniqueApps = getUniqueSubmissions(allApplications);
  const placed = uniqueApps.filter((app: any) => app.status === 'Placed');
  // Sort by created_at ascending
  const sorted = [...placed].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted.map((app, idx) => {
    const plcNumber = String(idx + 1).padStart(4, '0');
    const placementCode = `PLC-${plcNumber}`;
    return {
      ...app,
      placementCode
    };
  });
};

interface PipelineKPIsProps {
  applications: Array<{
    id: string;
    candidate_name?: string;
    candidate_email?: string;
    candidate_phone?: string;
    position?: string;
    client_name?: string;
    recruiter?: string;
    assigned_employee?: {
      full_name: string;
      email: string;
    } | null;
    remarks?: string;
    status: string;
    associatedApps?: any[];
  }>;
}

/**
 * Reusable Pipeline KPIs bar – same coloured cards as the Team Lead dashboard.
 * Counts are derived from the passed `applications` slice so each dashboard
 * can supply its own scope (all-org, team, or personal).
 */
export const isStatusAllowedForMetric = (currentStatus: string, targetStatus: string): boolean => {
  const statusRank: Record<string, number> = {
    'New': 1,
    'Submitted': 2,
    'Under Review': 3,
    'Interview Scheduled': 4,
    'Interview Completed': 5,
    'Offer Sent': 6,
    'Offer Accepted': 7,
    'Placed': 8,
    'Selected': 8
  };

  const currentRank = statusRank[currentStatus] || 0;
  const targetRank = statusRank[targetStatus] || 0;

  if (['Rejected', 'Closed', 'On Hold'].includes(currentStatus)) {
    return true;
  }

  return currentRank >= targetRank;
};

export const getStatusTransitionDate = (app: any, targetStatus: string, notesDict?: Record<string, any[]>): string => {
  if (!isStatusAllowedForMetric(app.status, targetStatus)) {
    return '';
  }
  if (notesDict && notesDict[app.id]) {
    const transitionNotes = notesDict[app.id]
      .filter((n: any) => n.content && n.content.includes(`Status updated to ${targetStatus}`))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (transitionNotes.length > 0) {
      return transitionNotes[0].created_at.slice(0, 10);
    }
  }
  if (app.transition_dates && app.transition_dates[targetStatus]) {
    return app.transition_dates[targetStatus];
  }
  if (app.notes && Array.isArray(app.notes)) {
    const transitionNotes = app.notes
      .filter((n: any) => n.content && n.content.includes(`Status updated to ${targetStatus}`))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (transitionNotes.length > 0) {
      return transitionNotes[0].created_at.slice(0, 10);
    }
  }
  if (app.status === targetStatus) {
    return (app.created_at || '').slice(0, 10);
  }
  if (targetStatus === 'Submitted' && hasReachedSubmittedMilestone(app)) {
    return (app.created_at || '').slice(0, 10);
  }
  return '';
};

export const PipelineKPIs: React.FC<PipelineKPIsProps> = ({ applications }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector((state: any) => state.auth);
  const { applications: allApps, notes } = useAppSelector((state: any) => state.applications || { applications: [], notes: {} });
  const { users } = useAppSelector((state: any) => state.users || { users: [] });

  const isAssociate = ['ASSOCIATE_ANALYST', 'SENIOR_ANALYST'].includes(currentUser?.role);

  const getRemarkFieldVal = (remarks: string | undefined | null, fieldName: string): string => {
    if (!remarks) return 'N/A';
    const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
    const value = match ? match[1].trim() : 'N/A';
    return value && value !== '' ? value : 'N/A';
  };

  const myAssignedApps = React.useMemo(() => {
    if (!isAssociate) return [];
    return allApps.filter((app: any) =>
      app.assigned_employee?.email === currentUser?.email &&
      getRemarkFieldVal(app.remarks, 'Job Code') !== 'N/A'
    );
  }, [allApps, currentUser, isAssociate]);

  const dateFilteredAssigned = React.useMemo(() => {
    if (!isAssociate) return [];
    const startDate = localStorage.getItem('dashboard_start_date') || '';
    const endDate = localStorage.getItem('dashboard_end_date') || '';
    if (!startDate || !endDate) return myAssignedApps;
    return myAssignedApps.filter((app: any) => {
      const d = (app.created_at || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [myAssignedApps, isAssociate]);

  const seenJobs = new Set<string>();
  const sourceAppsForCount = isAssociate ? dateFilteredAssigned : applications;
  sourceAppsForCount.forEach((app: any) => {
    const jobCode = getRemarkFieldVal(app.remarks, 'Job Code');
    if (jobCode === 'N/A' || !jobCode) return;
    seenJobs.add(jobCode.toUpperCase().trim());
  });
  const jobsCount = seenJobs.size;

  const filteredUsers = React.useMemo(() => users.filter((u: any) => u.role !== 'ADMIN' && u.role !== 'REPORTING_TEAM'), [users]);

  const getDescendantEmails = React.useCallback((email: string): string[] => {
    const direct = filteredUsers.filter((u: any) => u.reporting_to?.email?.toLowerCase() === email.toLowerCase());
    return [email, ...direct.flatMap((d: any) => getDescendantEmails(d.email))];
  }, [filteredUsers]);

  const scopeApps = React.useMemo(() => {
    const isHierarchyRoot = ['CEO', 'ADMIN', 'REPORTING_TEAM'].includes(currentUser?.role);
    const scopeEmails = isHierarchyRoot 
      ? filteredUsers.map((u: any) => u.email)
      : getDescendantEmails(currentUser?.email || '');

    const scopeEmailsLower = scopeEmails.map((e: string) => e.toLowerCase());

    const deduplicatedApps = getUniqueSubmissions(allApps);

    return deduplicatedApps.filter((app: any) => 
      app.assigned_employee?.email && 
      scopeEmailsLower.includes(app.assigned_employee.email.toLowerCase())
    );
  }, [allApps, currentUser, filteredUsers, getDescendantEmails]);

  const submissions = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter((app: any) =>
      app.candidate_name &&
      hasReachedSubmittedMilestone(app) &&
      (() => {
        const d = getStatusTransitionDate(app, 'Submitted', notes);
        return d >= startDate && d <= endDate;
      })()
    ).length;
  }, [scopeApps, notes]);

  const clientSubmissions = submissions;

  const clientInterviews = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter(app => {
      const dScheduled = getStatusTransitionDate(app, 'Interview Scheduled', notes);
      const dCompleted = getStatusTransitionDate(app, 'Interview Completed', notes);
      const matchScheduled = dScheduled >= startDate && dScheduled <= endDate;
      const matchCompleted = dCompleted >= startDate && dCompleted <= endDate;
      return matchScheduled || matchCompleted;
    }).length;
  }, [scopeApps, notes]);

  const clientRejections = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter(app => {
      const d = getStatusTransitionDate(app, 'Rejected', notes);
      return d >= startDate && d <= endDate;
    }).length;
  }, [scopeApps, notes]);

  const offerSent = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter(app => {
      const d = getStatusTransitionDate(app, 'Offer Sent', notes);
      return d >= startDate && d <= endDate;
    }).length;
  }, [scopeApps, notes]);

  const offerAccepted = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter(app => {
      const d = getStatusTransitionDate(app, 'Offer Accepted', notes);
      return d >= startDate && d <= endDate;
    }).length;
  }, [scopeApps, notes]);

  const placed = React.useMemo(() => {
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();
    return scopeApps.filter(app => {
      const d = getStatusTransitionDate(app, 'Placed', notes);
      return d >= startDate && d <= endDate;
    }).length;
  }, [scopeApps, notes]);

  const handleCardClick = (label: string, value: number) => {
    if (value === 0) return;
    let filtered: any[] = [];
    const startDate = localStorage.getItem('dashboard_start_date') || todayStr();
    const endDate = localStorage.getItem('dashboard_end_date') || todayStr();

    if (label === 'Jobs Count') {
      const seen = new Set<string>();
      const sourceApps = isAssociate ? dateFilteredAssigned : applications;
      sourceApps.forEach((app: any) => {
        const jobCode = getRemarkFieldVal(app.remarks, 'Job Code');
        if (jobCode === 'N/A' || !jobCode) return;
        const key = jobCode.toUpperCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          const group = allApps.filter((a: any) => {
            const code = getRemarkFieldVal(a.remarks, 'Job Code');
            return code && code.toUpperCase().trim() === key;
          });
          const rep = { ...(group.find((a: any) => !a.candidate_name) || group[0]) };
          rep.associatedApps = group;
          filtered.push(rep);
        }
      });
    } else if (label === 'Client Submissions') {
      filtered = scopeApps.filter(app =>
        app.candidate_name &&
        hasReachedSubmittedMilestone(app) &&
        (() => {
          const d = getStatusTransitionDate(app, 'Submitted', notes);
          return d >= startDate && d <= endDate;
        })()
      );
    } else if (label === 'Client Interviews') {
      filtered = scopeApps.filter(app => {
        const dScheduled = getStatusTransitionDate(app, 'Interview Scheduled', notes);
        const dCompleted = getStatusTransitionDate(app, 'Interview Completed', notes);
        const matchScheduled = dScheduled >= startDate && dScheduled <= endDate;
        const matchCompleted = dCompleted >= startDate && dCompleted <= endDate;
        return matchScheduled || matchCompleted;
      });
    } else if (label === 'Client Rejections') {
      filtered = scopeApps.filter(app => {
        const d = getStatusTransitionDate(app, 'Rejected', notes);
        return d >= startDate && d <= endDate;
      });
    } else if (label === 'Offer Sent') {
      filtered = scopeApps.filter(app => {
        const d = getStatusTransitionDate(app, 'Offer Sent', notes);
        return d >= startDate && d <= endDate;
      });
    } else if (label === 'Offer Accepted') {
      filtered = scopeApps.filter(app => {
        const d = getStatusTransitionDate(app, 'Offer Accepted', notes);
        return d >= startDate && d <= endDate;
      });
    } else if (label === 'Onboard') {
      filtered = scopeApps.filter(app => {
        const d = getStatusTransitionDate(app, 'Placed', notes);
        return d >= startDate && d <= endDate;
      });
    }

    navigate('/drill-down', {
      state: {
        modalTitle: label,
        modalData: filtered,
        isJobsType: label === 'Jobs Count',
        isApplicantsType: label !== 'Jobs Count'
      }
    });
  };

  const cards = [
    { label: 'Jobs Count', value: jobsCount, Icon: Briefcase, border: '#3b82f6', darkColor: '#60a5fa', lightColor: '#3b82f6', darkBg: 'rgba(59, 130, 246, 0.15)', lightBg: '#eff6ff' },
    { label: 'Client Submissions', value: clientSubmissions, Icon: Send, border: '#7c3aed', darkColor: '#a78bfa', lightColor: '#7c3aed', darkBg: 'rgba(124, 58, 237, 0.15)', lightBg: '#faf5ff' },
    { label: 'Client Interviews', value: clientInterviews, Icon: CalendarClock, border: '#16a34a', darkColor: '#4ade80', lightColor: '#16a34a', darkBg: 'rgba(22, 163, 74, 0.15)', lightBg: '#f0fdf4' },
    { label: 'Client Rejections', value: clientRejections, Icon: ThumbsDown, border: '#db2777', darkColor: '#f472b6', lightColor: '#db2777', darkBg: 'rgba(219, 39, 119, 0.15)', lightBg: '#fdf2f8' },
    { label: 'Offer Sent', value: offerSent, Icon: MailCheck, border: '#eab308', darkColor: '#facc15', lightColor: '#ca8a04', darkBg: 'rgba(234, 179, 8, 0.15)', lightBg: '#fefce8' },
    { label: 'Offer Accepted', value: offerAccepted, Icon: BadgeCheck, border: '#475569', darkColor: '#94a3b8', lightColor: '#475569', darkBg: 'rgba(71, 85, 105, 0.15)', lightBg: '#f8fafc' },
    { label: 'Onboard', value: placed, Icon: Briefcase, border: '#d946ef', darkColor: '#e879f9', lightColor: '#d946ef', darkBg: 'rgba(217, 70, 239, 0.15)', lightBg: '#fae8ff' },
  ];

  const isDark = theme.palette.mode === 'dark';

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 800, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Dashboards KPIs
        </Typography>
      </Box>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {cards.map((card) => {
          const { Icon } = card;
          const iconColor = isDark ? '#3b82f6' : '#0062AD';
          const iconBg = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0, 98, 173, 0.08)';
          return (
            <Grid item xs={6} sm={3} md={1.7} key={card.label}>
              <Card
                onClick={() => handleCardClick(card.label, card.value)}
                sx={{
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '12px',
                  textAlign: 'left',
                  height: '100%',
                  p: 2,
                  boxShadow: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '88px',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: card.value > 0 ? 'pointer' : 'default',
                  '&:hover': card.value > 0 ? {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 12px rgba(0, 98, 173, 0.08)'
                  } : {}
                }}
              >
                {/* Contextual icon badge – top right corner */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    bgcolor: iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} color={iconColor} strokeWidth={2.2} />
                </Box>

                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}
                >
                  {card.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', lineHeight: 1.2 }}
                >
                  {card.label}
                </Typography>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </>
  );
};
