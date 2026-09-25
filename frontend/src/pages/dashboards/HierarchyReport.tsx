import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  useTheme,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress
} from '@mui/material';
import {
  PlusSquare,
  MinusSquare,
  FolderTree
} from 'lucide-react';
import { useAppSelector } from '../../redux/store';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { getUniqueSubmissions } from './PipelineKPIs';

import { api } from '../../services/api';

interface CalculatedMetrics {
  jobsCount: number;
  submissions: number;
  interviews: number;
  offers: number;
  offerAccepted: number;
  onboard: number;
}

interface BackendUserMetric extends CalculatedMetrics {
  jobCodes?: string[];
}

interface TreeElement {
  user: User;
  individualMetrics: CalculatedMetrics;
  aggregatedMetrics: CalculatedMetrics;
  children: TreeElement[];
}

interface RenderRow {
  key: string;
  user: User;
  displayName: string;
  depth: number;
  isSelfRow: boolean;
  isManager: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  metrics: CalculatedMetrics;
  connectorLines: boolean[];
  isLastChild: boolean;
}

interface HierarchyReportProps {
  rootEmail?: string; // If provided, tree starts from this user (e.g. SENIOR_MANAGER)
  startDate?: string;
  endDate?: string;
}

export const getStatusTransitionDate = (
  app: any,
  targetStatus: string,
  notesDict?: Record<string, any[]>
): string => {
 
  // 1. Check Redux notes first.
  if (notesDict && notesDict[app.id]) {
    const transitionNotes = notesDict[app.id]
      .filter((n: any) => {
        const content = (n.content || '').trim().toLowerCase();
        return content.startsWith(`status updated to ${targetStatus}`.toLowerCase());
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
 
    if (transitionNotes.length > 0 && transitionNotes[0].created_at) {
      return transitionNotes[0].created_at.slice(0, 10);
    }
  }
 
  // 2. Check transition_dates supplied by backend.
  if (
    app.transition_dates &&
    app.transition_dates[targetStatus]
  ) {
    return String(app.transition_dates[targetStatus]).slice(0, 10);
  }
 
  // 3. Check notes attached directly to the application.
  if (app.notes && Array.isArray(app.notes)) {
    const transitionNotes = app.notes
      .filter((n: any) => {
        const content = (n.content || '').trim().toLowerCase();
        return content.startsWith(`status updated to ${targetStatus}`.toLowerCase());
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
 
    if (transitionNotes.length > 0 && transitionNotes[0].created_at) {
      return transitionNotes[0].created_at.slice(0, 10);
    }
  }
 
  return '';
};

export const getRemarkField = (remarks: string | undefined | null, fieldName: string): string => {
  if (!remarks) return 'N/A';
  const match = remarks.match(new RegExp(`^${fieldName}:[ \\t]*(.+)`, 'im'));
  const value = match ? match[1].trim() : 'N/A';
  return value && value !== '' ? value : 'N/A';
};

export const HierarchyReport: React.FC<HierarchyReportProps> = ({ rootEmail, startDate, endDate }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { users } = useAppSelector(state => state.users);
  const { applications } = useAppSelector(state => state.applications || { applications: [] });
  const filteredUsers = useMemo(() => users.filter(u => u.role !== 'ADMIN' && u.role !== 'REPORTING_TEAM'), [users]);

  const [localStartDate, setLocalStartDate] = useState(todayStr());
  const [localEndDate, setLocalEndDate] = useState(todayStr());
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [backendUserMetrics, setBackendUserMetrics] = useState<Record<string, BackendUserMetric>>({});
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const effectiveStartDate = startDate !== undefined ? startDate : localStartDate;
  const effectiveEndDate = endDate !== undefined ? endDate : localEndDate;

  useEffect(() => {
    let url = 'applications/hierarchy-stats/';
    if (effectiveStartDate && effectiveEndDate) {
      url += `?start_date=${effectiveStartDate}&end_date=${effectiveEndDate}`;
    }
    setBackendUserMetrics({});
    setIsStatsLoading(true);
    let isCancelled = false;
    api.get(url)
      .then((res: any) => {
        if (isCancelled) return;
        if (res.data?.user_metrics) {
          setBackendUserMetrics(res.data.user_metrics);
        } else {
          setBackendUserMetrics({});
        }
      })
      .catch((err: any) => {
        if (isCancelled) return;
        console.error("Failed to load hierarchy stats:", err);
        setBackendUserMetrics({});
      })
      .finally(() => {
        if (!isCancelled) {
          setIsStatsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [effectiveStartDate, effectiveEndDate]);

  const deduplicatedSubmissionsApps = useMemo(() => {
    return getUniqueSubmissions(applications);
  }, [applications]);

  // Pre-computed map of descendant emails for fast lookup
  const descendantEmailsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const getDescendants = (email: string): string[] => {
      const direct = filteredUsers.filter(u => {
        if (u.email?.toLowerCase() === email.toLowerCase()) return false;
        if (u.email?.toLowerCase() === 'satyasaikumar.g@people-prime.com') {
          return u.reporting_to_list?.some((r: any) => r.email?.toLowerCase() === email.toLowerCase()) ||
                 u.reporting_to?.email?.toLowerCase() === email.toLowerCase();
        }
        return u.reporting_to?.email?.toLowerCase() === email.toLowerCase();
      });
      return [email.toLowerCase(), ...direct.flatMap(d => getDescendants(d.email))];
    };
    filteredUsers.forEach(u => {
      map.set(u.email.toLowerCase(), new Set(getDescendants(u.email)));
    });
    return map;
  }, [filteredUsers]);

  const [drilldownLoadingKey, setDrilldownLoadingKey] = useState<string | null>(null);

  const handleMetricClick = async (userEmail: string, _userName: string, _roleName: string, metricType: string, isSelfRow: boolean) => {
    if (drilldownLoadingKey !== null) return;
    const clickKey = `${userEmail}_${metricType}_${isSelfRow}`;

    const cleanEmail = userEmail.replace(/_(cwr|fte)$/i, '').toLowerCase();

    const emailSet = descendantEmailsMap.get(cleanEmail);
    const emails = isSelfRow ? [cleanEmail] : (emailSet ? Array.from(emailSet) : [cleanEmail]);

    let label = '';
    let isJobs = false;
    let isApplicants = false;
    let isHierarchy = false;

    if (metricType === 'JOBS') {
      label = 'Jobs Count';
      isJobs = true;
    } else if (metricType === 'SUBMISSIONS') {
      label = 'Client Submissions';
      isApplicants = true;
    } else if (metricType === 'INTERVIEWS') {
      label = 'Client Interviews';
      isApplicants = true;
    } else if (metricType === 'OFFERS') {
      label = 'Offer Sent';
      isApplicants = true;
    } else if (metricType === 'OFFER_ACCEPTED') {
      label = 'Offer Accepted';
      isApplicants = true;
    } else if (metricType === 'ONBOARD') {
      label = 'Onboard';
      isApplicants = true;
    }

    try {
      setDrilldownLoadingKey(clickKey);
      const res = await api.post('applications/hierarchy-drilldown/', {
        metric_type: metricType,
        emails: emails,
        start_date: effectiveStartDate,
        end_date: effectiveEndDate
      });
      const records = res.data?.results || res.data || [];
      navigate('/drill-down', {
        state: {
          modalTitle: label,
          modalData: records,
          isJobsType: isJobs,
          isApplicantsType: isApplicants,
          isHierarchyType: isHierarchy
        }
      });
    } catch (err) {
      console.error('Failed to load drilldown data:', err);
    } finally {
      setDrilldownLoadingKey(null);
    }
  };

  const renderClickableMetric = (value: number, userEmail: string, userName: string, roleName: string, metricType: string, isSelfRow: boolean) => {
    const clickKey = `${userEmail}_${metricType}_${isSelfRow}`;
    const isDrillLoading = drilldownLoadingKey === clickKey;

    if (isStatsLoading) {
      return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '18px' }}>
          <CircularProgress size={12} sx={{ color: theme.palette.text.secondary, opacity: 0.5 }} />
        </Box>
      );
    }

    if (isDrillLoading) {
      return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '18px' }}>
          <CircularProgress size={12} color="primary" />
        </Box>
      );
    }

    const isClickable = value > 0 && !drilldownLoadingKey;

    return (
      <Typography
        variant="body2"
        sx={{
          fontWeight: isSelfRow ? 500 : 700,
          fontSize: '0.75rem',
          color: value === 0 ? 'text.secondary' : 'primary.main',
          cursor: isClickable ? 'pointer' : 'default',
          opacity: drilldownLoadingKey ? 0.6 : 1,
          pointerEvents: drilldownLoadingKey ? 'none' : 'auto',
          '&:hover': {
            color: isClickable ? 'primary.dark' : (value === 0 ? 'text.secondary' : 'primary.main'),
            textDecoration: isClickable ? 'underline' : 'none'
          }
        }}
        onClick={() => {
          if (!isClickable) return;
          handleMetricClick(userEmail, userName, roleName, metricType, isSelfRow);
        }}
      >
        {value}
      </Typography>
    );
  };

  // Toggle Collapse on a Manager Node
  const toggleCollapse = (email: string) => {
    setCollapsedNodes(prev => {
      const isCurrentlyCollapsed = prev[email] !== false;
      return {
        ...prev,
        [email]: !isCurrentlyCollapsed
      };
    });
  };

  // Expand All / Collapse All
  const expandAll = () => {
    const expanded: Record<string, boolean> = {};
    filteredUsers.forEach(u => {
      expanded[u.email] = false;
      expanded[`${u.email}_cwr`] = false;
      expanded[`${u.email}_fte`] = false;
    });
    setCollapsedNodes(expanded);
  };
  const collapseAll = () => {
    setCollapsedNodes({});
  };

  // Helper to compute individual metrics for a user
  const computeIndividualMetrics = (email: string): CalculatedMetrics => {
    const cleanEmail = email.toLowerCase();
    const stats = backendUserMetrics[cleanEmail];
    if (stats) {
      return {
        jobsCount: stats.jobsCount || 0,
        submissions: stats.submissions || 0,
        interviews: stats.interviews || 0,
        offers: stats.offers || 0,
        offerAccepted: stats.offerAccepted || 0,
        onboard: stats.onboard || 0
      };
    }

    return {
      jobsCount: 0,
      submissions: 0,
      interviews: 0,
      offers: 0,
      offerAccepted: 0,
      onboard: 0
    };
  };

  // Build Hierarchy Tree recursively
  const hierarchyTree = useMemo(() => {
    const getUserEmployeeType = (userEmail: string): 'CWR' | 'FTE' => {
      const emailsSet = descendantEmailsMap.get(userEmail.toLowerCase());
      const subApps = deduplicatedSubmissionsApps.filter(app => app.assigned_employee?.email && emailsSet?.has(app.assigned_employee.email.toLowerCase()));

      let cwrCount = 0;
      let fteCount = 0;
      subApps.forEach(app => {
        const remarks = app.remarks || '';
        if (remarks.includes('Employee Type: CWR')) {
          cwrCount++;
        } else if (remarks.includes('Employee Type: FTE')) {
          fteCount++;
        }
      });

      const emailLower = userEmail.toLowerCase();
      if (
        emailLower.includes('gayathri') ||
        emailLower.includes('uday') ||
        emailLower.includes('ajay') ||
        emailLower.includes('bhavya') ||
        emailLower.includes('saritha') ||
        emailLower.includes('bhargav') ||
        emailLower.includes('sushma') ||
        emailLower.includes('vineetha') ||
        emailLower.includes('yeliya') ||
        emailLower.includes('madduri')
      ) {
        return 'CWR';
      }
      return cwrCount > fteCount ? 'CWR' : 'FTE';
    };

    const buildTreeElement = (user: User): TreeElement => {
      const individual = computeIndividualMetrics(user.email);
      const directReports = filteredUsers.filter(u => {
        if (u.email?.toLowerCase() === user.email?.toLowerCase()) return false;
        if (u.email?.toLowerCase() === 'satyasaikumar.g@people-prime.com') {
          return u.reporting_to_list?.some((r: any) => r.email?.toLowerCase() === user.email?.toLowerCase()) ||
                 u.reporting_to?.email?.toLowerCase() === user.email?.toLowerCase();
        }
        return u.reporting_to?.email?.toLowerCase() === user.email?.toLowerCase();
      });

      const isHarshitha = user.full_name.toLowerCase() === 'harshitha desai' || user.email.toLowerCase() === 'harshitha.d@people-prime.com';
      const isSwarupa = user.full_name.toLowerCase() === 'swarupa thalashila' || user.email.toLowerCase() === 'swarupa.t@people-prime.com';
      const isSplitNode = isHarshitha || isSwarupa;

      if (isSplitNode) {
        const cwrReports = directReports.filter(u => getUserEmployeeType(u.email) === 'CWR');
        const fteReports = directReports.filter(u => getUserEmployeeType(u.email) === 'FTE');

        const cwrChildren = cwrReports.map(buildTreeElement);
        const fteChildren = fteReports.map(buildTreeElement);

        const virtualUserCWR: User = {
          id: `${user.id || user.email}_cwr`,
          email: `${user.email}_cwr`,
          full_name: `${user.full_name} CWR`,
          role: user.role,
          reporting_to: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role
          },
          date_of_joining: user.date_of_joining,
          must_change_password: false,
          is_active: true
        };
        const virtualUserFTE: User = {
          id: `${user.id || user.email}_fte`,
          email: `${user.email}_fte`,
          full_name: `${user.full_name} FTE`,
          role: user.role,
          reporting_to: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role
          },
          date_of_joining: user.date_of_joining,
          must_change_password: false,
          is_active: true
        };

        const collectAllEmails = (element: TreeElement): string[] => {
          const emails: string[] = [];
          if (!element.user.email.includes('_cwr') && !element.user.email.includes('_fte')) {
            emails.push(element.user.email);
          }
          element.children.forEach(child => {
            emails.push(...collectAllEmails(child));
          });
          return emails;
        };

        const computeUniqueJobsCountForTree = (individualEmails: string[], childrenList: TreeElement[]): number => {
          const emailSet = new Set<string>(individualEmails.map(e => e.toLowerCase()));
          childrenList.forEach(child => {
            collectAllEmails(child).forEach(e => emailSet.add(e.toLowerCase()));
          });

          const seen = new Set<string>();
          emailSet.forEach(e => {
            const codes = backendUserMetrics[e]?.jobCodes || [];
            codes.forEach(c => seen.add(c));
          });
          return seen.size;
        };

        const sumMetrics = (individualVal: CalculatedMetrics, childrenList: TreeElement[]): CalculatedMetrics => {
          return {
            jobsCount: individualVal.jobsCount + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.jobsCount, 0),
            submissions: individualVal.submissions + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.submissions, 0),
            interviews: individualVal.interviews + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.interviews, 0),
            offers: individualVal.offers + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.offers, 0),
            offerAccepted: individualVal.offerAccepted + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.offerAccepted, 0),
            onboard: individualVal.onboard + childrenList.reduce((acc, c) => acc + c.aggregatedMetrics.onboard, 0),
          };
        };

        const zeroMetrics = { jobsCount: 0, submissions: 0, interviews: 0, offers: 0, offerAccepted: 0, onboard: 0 };
        const cwrAggregated = {
          ...sumMetrics(zeroMetrics, cwrChildren),
          jobsCount: computeUniqueJobsCountForTree([], cwrChildren)
        };
        const fteAggregated = {
          ...sumMetrics(zeroMetrics, fteChildren),
          jobsCount: computeUniqueJobsCountForTree([], fteChildren)
        };

        const cwrElement: TreeElement = {
          user: virtualUserCWR,
          individualMetrics: zeroMetrics,
          aggregatedMetrics: cwrAggregated,
          children: cwrChildren
        };

        const fteElement: TreeElement = {
          user: virtualUserFTE,
          individualMetrics: zeroMetrics,
          aggregatedMetrics: fteAggregated,
          children: fteChildren
        };

        const childrenElements = [cwrElement, fteElement];

        const aggregated = {
          jobsCount: computeUniqueJobsCountForTree([user.email], childrenElements),
          submissions: individual.submissions + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.submissions, 0),
          interviews: individual.interviews + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.interviews, 0),
          offers: individual.offers + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.offers, 0),
          offerAccepted: individual.offerAccepted + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.offerAccepted, 0),
          onboard: individual.onboard + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.onboard, 0),
        };

        return {
          user,
          individualMetrics: individual,
          aggregatedMetrics: aggregated,
          children: childrenElements
        };
      } else {
        const childrenElements = directReports.map(buildTreeElement);

        const collectAllEmails = (element: TreeElement): string[] => {
          const emails: string[] = [];
          if (!element.user.email.includes('_cwr') && !element.user.email.includes('_fte')) {
            emails.push(element.user.email);
          }
          element.children.forEach(child => {
            emails.push(...collectAllEmails(child));
          });
          return emails;
        };

        const computeUniqueJobsCountForTree = (individualEmails: string[], childrenList: TreeElement[]): number => {
          const emailSet = new Set<string>(individualEmails.map(e => e.toLowerCase()));
          childrenList.forEach(child => {
            collectAllEmails(child).forEach(e => emailSet.add(e.toLowerCase()));
          });

          const seen = new Set<string>();
          emailSet.forEach(e => {
            const codes = backendUserMetrics[e]?.jobCodes || [];
            codes.forEach(c => seen.add(c));
          });
          return seen.size;
        };

        const aggregated = {
          jobsCount: computeUniqueJobsCountForTree([user.email], childrenElements),
          submissions: individual.submissions + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.submissions, 0),
          interviews: individual.interviews + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.interviews, 0),
          offers: individual.offers + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.offers, 0),
          offerAccepted: individual.offerAccepted + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.offerAccepted, 0),
          onboard: individual.onboard + childrenElements.reduce((acc, c) => acc + c.aggregatedMetrics.onboard, 0),
        };

        return {
          user,
          individualMetrics: individual,
          aggregatedMetrics: aggregated,
          children: childrenElements
        };
      }
    };

    // If rootEmail is provided (e.g. SENIOR_MANAGER view), start tree from that person
    if (rootEmail) {
      const rootUser = filteredUsers.find(u => u.email.toLowerCase() === rootEmail.toLowerCase());
      if (rootUser) {
        return [buildTreeElement(rootUser)];
      }
      return [];
    }

    // Default CEO view: start from top-level roots
    const roots = filteredUsers.filter(u =>
      !u.reporting_to ||
      u.reporting_to.email?.toLowerCase() === u.email?.toLowerCase() ||
      u.role === 'CEO'
    );

    const sortedRoots = [...roots].sort((a, b) => {
      if (a.role === 'CEO') return -1;
      if (b.role === 'CEO') return 1;
      return 0;
    });

    const trueRoots = sortedRoots.filter(r =>
      !filteredUsers.some(other => other.email !== r.email && other.email === r.reporting_to?.email)
    );

    return trueRoots.map(buildTreeElement);
  }, [filteredUsers, applications, effectiveStartDate, effectiveEndDate, rootEmail, backendUserMetrics]);

  // Flatten Tree for Grid Rendering
  const rows = useMemo(() => {
    const list: RenderRow[] = [];

    const traverse = (node: TreeElement, depth: number, parentLines: boolean[], isLastChild: boolean) => {
      const hasChildren = node.children.length > 0;
      const isCollapsed = collapsedNodes[node.user.email] !== false;

      list.push({
        key: `manager_${node.user.email}`,
        user: node.user,
        displayName: node.user.full_name,
        depth,
        isSelfRow: false,
        isManager: hasChildren || node.user.email.toLowerCase().includes('gayathri'),
        hasChildren,
        isCollapsed,
        metrics: node.aggregatedMetrics,
        connectorLines: parentLines,
        isLastChild
      });

      if (!isCollapsed && hasChildren) {
        const selfRowIsLast = node.children.length === 0;

        list.push({
          key: `self_${node.user.email}`,
          user: node.user,
          displayName: node.user.full_name,
          depth: depth + 1,
          isSelfRow: true,
          isManager: false,
          hasChildren: false,
          isCollapsed: false,
          metrics: node.individualMetrics,
          connectorLines: [...parentLines, !isLastChild],
          isLastChild: selfRowIsLast
        });

        node.children.forEach((child, index) => {
          const isChildLast = index === node.children.length - 1;
          traverse(child, depth + 1, [...parentLines, !isLastChild], isChildLast);
        });
      }
    };

    hierarchyTree.forEach((root, idx) => {
      const isLastRoot = idx === hierarchyTree.length - 1;
      traverse(root, 0, [], isLastRoot);
    });
    return list;
  }, [hierarchyTree, collapsedNodes]);

  // Helper to render tree connection lines
  const renderConnectors = (row: RenderRow) => {
    return (
      <Box sx={{ display: 'flex', alignItems: 'stretch', alignSelf: 'stretch', height: '32px', mr: 1 }}>
        {row.connectorLines.map((lineActive, idx) => (
          <Box key={idx} sx={{ width: 24, display: 'flex', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
            {lineActive && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: '1.5px',
                  bgcolor: theme.palette.divider,
                  transform: 'translateX(-50%)'
                }}
              />
            )}
          </Box>
        ))}
        {row.depth > 0 && (
          <Box sx={{ width: 24, display: 'flex', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: row.isLastChild ? '50%' : 0,
                left: '50%',
                width: '1.5px',
                bgcolor: theme.palette.divider,
                transform: 'translateX(-50%)'
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                right: 0,
                height: '1.5px',
                bgcolor: theme.palette.divider,
                transform: 'translateY(-50%)'
              }}
            />
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Card sx={{ borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <Box sx={{
          p: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          bgcolor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderTree size={20} color={theme.palette.primary.main} />
            <Typography variant="h6" fontWeight={800} sx={{ fontSize: '1rem' }}>
              Hierarchy Report
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="text"
              size="small"
              onClick={expandAll}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
            >
              Expand All
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={collapseAll}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
            >
              Collapse All
            </Button>

            {!startDate && !endDate && (
              <DashboardCalendar
                startDate={effectiveStartDate}
                endDate={effectiveEndDate}
                onChange={(start, end) => {
                  setLocalStartDate(start);
                  setLocalEndDate(end);
                }}
              />
            )}
          </Box>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow style={{
                  borderBottom: `2px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.mode === 'light' ? '#f1f5f9' : '#1e293b'
                }}>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, minWidth: '300px', whiteSpace: 'nowrap' }}>User Name</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Jobs Count</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Client Submissions</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Interview Schedules</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Offer Sent</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Offer Accepted</TableCell>
                  <TableCell style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 800, color: theme.palette.text.secondary, textAlign: 'center', whiteSpace: 'nowrap' }}>Onboard</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} style={{ padding: '24px', textAlign: 'center' }}>
                      {users.length === 0 || isStatsLoading ? (
                        <Typography variant="body2" color="primary" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, fontWeight: 700 }}>
                          <CircularProgress size={16} color="primary" /> Loading...
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">No staff members found to build hierarchy tree.</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    return (
                      <TableRow
                        key={row.key}
                        sx={{
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          backgroundColor: row.isSelfRow
                            ? (theme.palette.mode === 'light' ? '#f8fafc50' : '#1e293b30')
                            : 'transparent',
                          transition: 'background-color 0.2s ease',
                          '&:hover': {
                            backgroundColor: theme.palette.mode === 'light' ? '#f1f5f950' : '#1e293b50'
                          }
                        }}
                      >
                        <TableCell style={{ padding: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                            {renderConnectors(row)}
                            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              {row.isManager ? (
                                <IconButton
                                  size="small"
                                  onClick={() => toggleCollapse(row.user.email)}
                                  sx={{ p: 0.25, mr: 0.5, color: theme.palette.primary.main, flexShrink: 0 }}
                                >
                                  {row.isCollapsed ? (
                                    <PlusSquare size={14} />
                                  ) : (
                                    <MinusSquare size={14} />
                                  )}
                                </IconButton>
                              ) : (
                                <Box sx={{ width: '22px', display: 'inline-block', flexShrink: 0 }} />
                              )}
                              <Typography
                                variant="body2"
                                fontWeight={row.isSelfRow ? 500 : 700}
                                color={row.isSelfRow ? 'text.secondary' : 'text.primary'}
                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}
                              >
                                {row.displayName}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.jobsCount, row.user.email, row.user.full_name, row.user.role, 'JOBS', row.isSelfRow)}
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.submissions, row.user.email, row.user.full_name, row.user.role, 'SUBMISSIONS', row.isSelfRow)}
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.interviews, row.user.email, row.user.full_name, row.user.role, 'INTERVIEWS', row.isSelfRow)}
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.offers, row.user.email, row.user.full_name, row.user.role, 'OFFERS', row.isSelfRow)}
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.offerAccepted, row.user.email, row.user.full_name, row.user.role, 'OFFER_ACCEPTED', row.isSelfRow)}
                        </TableCell>
                        <TableCell style={{ padding: '4px 8px', textAlign: 'center' }}>
                          {renderClickableMetric(row.metrics.onboard, row.user.email, row.user.full_name, row.user.role, 'ONBOARD', row.isSelfRow)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
