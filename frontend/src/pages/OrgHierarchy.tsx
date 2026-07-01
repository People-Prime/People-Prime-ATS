import React from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Avatar, 
  Divider,
  useTheme 
} from '@mui/material';
import { 
  ArrowDown
} from 'lucide-react';
import { useAppSelector } from '../redux/store';
import { User, UserRole } from '../types';

export const OrgHierarchy: React.FC = () => {
  const theme = useTheme();
  const { users } = useAppSelector(state => state.users);

  // Group users by hierarchy levels
  const ceo = users.find(u => u.role === 'CEO');
  const seniorManagers = users.filter(u => u.role === 'SENIOR_MANAGER');
  const juniorManagers = users.filter(u => u.role === 'JUNIOR_MANAGER');
  const teamLeads = users.filter(u => u.role === 'TEAM_LEAD');
  const subLeads = users.filter(u => u.role === 'SUB_LEAD');
  const associates = users.filter(u => u.role === 'ASSOCIATE_ANALYST' || u.role === 'SENIOR_ANALYST');

  // Role Color Mapping for Avatar Ring
  const getRoleColor = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      'ADMIN': '#94a3b8', // Gray
      'CEO': '#8b5cf6', // Purple
      'SENIOR_MANAGER': '#4f46e5', // Indigo
      'JUNIOR_MANAGER': '#06b6d4', // Cyan
      'TEAM_LEAD': '#0d9488', // Teal
      'SUB_LEAD': '#f59e0b', // Amber
      'SENIOR_ANALYST': '#059669', // Emerald/Green
      'ASSOCIATE_ANALYST': '#10b981', // Emerald
    };
    return colors[role] || '#64748b';
  };

  // Helper Card Component for each employee node in the chart
  const EmployeeNode: React.FC<{ employee: User }> = ({ employee }) => {
    const roleColor = getRoleColor(employee.role);
    return (
      <Card 
        className="hover-lift"
        sx={{ 
          minWidth: 240, 
          maxWidth: 280,
          m: 1, 
          border: `1px solid ${theme.palette.divider}`,
          borderLeft: `5px solid ${roleColor}`,
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.02)'
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar 
              sx={{ 
                bgcolor: 'transparent', 
                color: roleColor, 
                border: `2.5px solid ${roleColor}`,
                fontWeight: 700,
                width: 38,
                height: 38,
                fontSize: '0.9rem'
              }}
            >
              {employee.full_name.charAt(0)}
            </Avatar>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {employee.full_name}
              </Typography>
              <Typography 
                variant="caption" 
                noWrap 
                sx={{ 
                  display: 'block', 
                  color: roleColor,
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                {employee.role.replace('_', ' ')}
              </Typography>
            </Box>
          </Box>
          
          <Divider sx={{ my: 1.2 }} />

          <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: '0.72rem' }}>
            <strong>Email:</strong> {employee.email}
          </Typography>
          {employee.team && (
            <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: '0.72rem', mt: 0.2 }}>
              <strong>Team:</strong> {employee.team.name}
            </Typography>
          )}
          {employee.reporting_to && (
            <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: '0.72rem', mt: 0.2 }}>
              <strong>Reports to:</strong> {employee.reporting_to.full_name}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* Title */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Organizational Reporting Hierarchy
        </Typography>
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          Detailed chain of command from CEO down to Associate Analysts.
        </Typography>
      </Box>

      {/* Visual Chart Canvas */}
      <Box 
        sx={{ 
          p: 3, 
          borderRadius: '16px', 
          border: `1px dashed ${theme.palette.divider}`,
          bgcolor: theme.palette.mode === 'light' ? '#fcfdfe' : '#0c111e',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          overflowX: 'auto'
        }}
      >
        {/* LEVEL 1: CEO */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
            Executive Leadership
          </Typography>
          {ceo ? (
            <EmployeeNode employee={ceo} />
          ) : (
            <Typography variant="body2" color="text.secondary">No CEO configured in directory.</Typography>
          )}
        </Box>

        {ceo && seniorManagers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <ArrowDown size={20} />
          </Box>
        )}

        {/* LEVEL 2: Senior Managers */}
        {seniorManagers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
              Senior Management
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {seniorManagers.map(mgr => (
                <EmployeeNode key={mgr.id} employee={mgr} />
              ))}
            </Box>
          </Box>
        )}

        {seniorManagers.length > 0 && juniorManagers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <ArrowDown size={20} />
          </Box>
        )}

        {/* LEVEL 3: Junior Managers */}
        {juniorManagers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
              Operations Management
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {juniorManagers.map(jmgr => (
                <EmployeeNode key={jmgr.id} employee={jmgr} />
              ))}
            </Box>
          </Box>
        )}

        {juniorManagers.length > 0 && teamLeads.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <ArrowDown size={20} />
          </Box>
        )}

        {/* LEVEL 4: Team Leads */}
        {teamLeads.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
              Team Leadership
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {teamLeads.map(tl => (
                <EmployeeNode key={tl.id} employee={tl} />
              ))}
            </Box>
          </Box>
        )}

        {teamLeads.length > 0 && subLeads.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <ArrowDown size={20} />
          </Box>
        )}

        {/* LEVEL 5: Sub Leads */}
        {subLeads.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
              Sub-Team Leads
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {subLeads.map(sl => (
                <EmployeeNode key={sl.id} employee={sl} />
              ))}
            </Box>
          </Box>
        )}

        {subLeads.length > 0 && associates.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
            <ArrowDown size={20} />
          </Box>
        )}

        {/* LEVEL 6: Associate Analysts */}
        {associates.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, letterSpacing: 1 }}>
              Associate Sourcing Analysts (Team Members)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {associates.map(assoc => (
                <EmployeeNode key={assoc.id} employee={assoc} />
              ))}
            </Box>
          </Box>
        )}

      </Box>
    </Box>
  );
};
