import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Button,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  FormControl,
  Select,
  MenuItem,
  TextField,
  DialogActions,
  Chip
} from '@mui/material';
import { Plus, Check, RefreshCw } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../../redux/store';
import { changeApplicationStatus, addApplicationNote, setApplications } from '../../redux/applicationsSlice';
import { api } from '../../services/api';
import { ApplicationStatus } from '../../types';
import { DashboardCalendar, todayStr } from './DashboardCalendar';
import { HierarchyReport } from './HierarchyReport';

export const LeadDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const { user: currentUser } = useAppSelector(state => state.auth);
  const { users } = useAppSelector(state => state.users);
  const dbCurrentUser = users.find(u => u.email === currentUser?.email);
  const myTeamName = (dbCurrentUser?.teams || currentUser?.teams || [])[0]?.name || 'My Team';

  const [startDate, setStartDate] = useState(() => localStorage.getItem(`dashboard_start_date_${currentUser?.email}`) || todayStr());
  const [endDate, setEndDate] = useState(() => localStorage.getItem(`dashboard_end_date_${currentUser?.email}`) || todayStr());

  const dispatch = useAppDispatch();

  React.useEffect(() => {
    if (currentUser?.email) {
      localStorage.setItem(`dashboard_start_date_${currentUser.email}`, startDate);
      localStorage.setItem(`dashboard_end_date_${currentUser.email}`, endDate);
    }

    let url = 'applications/?all_applicants=true';
    if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    api.get(url).then((res: any) => {
      const list = res.data?.results ?? res.data ?? [];
      dispatch(setApplications(list));
    }).catch(() => {});
  }, [startDate, endDate, currentUser, dispatch]);
  const [statusUpdateApp, setStatusUpdateApp] = useState<any | null>(null);
  const [statusUpdateValue, setStatusUpdateValue] = useState<ApplicationStatus>('New');
  const [statusUpdateComment, setStatusUpdateComment] = useState('');
  const [payRateInput, setPayRateInput] = useState('');
  const [variablePayInput, setVariablePayInput] = useState('');
  const [offerValueInput, setOfferValueInput] = useState('');
  const [profitAmountInput, setProfitAmountInput] = useState('');
  const [dateOfJoinInput, setDateOfJoinInput] = useState('');

  const handleUpdateStatusSubmit = async () => {
    if (!statusUpdateApp) return;
    if (statusUpdateValue === 'Offer Sent') {
      if (!payRateInput.trim() || !offerValueInput.trim() || !profitAmountInput.trim() || !dateOfJoinInput.trim()) {
        alert("Please fill in all required financial details (Pay Rate, Offer Value, Profit Amount, Date of Join).");
        return;
      }
    }
    try {
      let updatedRemarks = statusUpdateApp.remarks || '';
      if (statusUpdateValue === 'Offer Sent') {
        const fieldsToUpdate: Record<string, string> = {
          'Pay Rate': payRateInput.trim(),
          'Variable Pay': variablePayInput.trim(),
          'Offer Value': offerValueInput.trim(),
          'Profit Amount': profitAmountInput.trim(),
          'Date of Join': dateOfJoinInput.trim()
        };

        Object.entries(fieldsToUpdate).forEach(([key, val]) => {
          if (!val) return;
          const regex = new RegExp(`^${key}:.*$`, 'im');
          if (regex.test(updatedRemarks)) {
            updatedRemarks = updatedRemarks.replace(regex, `${key}: ${val}`);
          } else {
            updatedRemarks = updatedRemarks ? `${updatedRemarks}\n${key}: ${val}` : `${key}: ${val}`;
          }
        });
      }

      const patchPayload: any = { status: statusUpdateValue };
      if (statusUpdateValue === 'Offer Sent') {
        patchPayload.remarks = updatedRemarks;
      }

      await api.patch(`applications/${statusUpdateApp.id}/`, patchPayload);

      const commentMsg = statusUpdateComment ? `\nComment: ${statusUpdateComment}` : '';
      await api.post(`applications/${statusUpdateApp.id}/add-note/`, {
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`
      });

      dispatch(changeApplicationStatus({ id: statusUpdateApp.id, status: statusUpdateValue }));

      dispatch(addApplicationNote({
        id: `note_status_${Date.now()}`,
        application_id: statusUpdateApp.id,
        author: {
          id: currentUser?.id || 'sys',
          full_name: currentUser?.full_name || 'System',
          role: currentUser?.role || 'TEAM_LEAD'
        },
        content: `Status updated to ${statusUpdateValue}.${commentMsg}`,
        created_at: new Date().toISOString()
      }));

      setStatusUpdateApp(null);
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  const handleOpenAddReq = () => {
    navigate('/applications/create');
  };





  return (
    <Box>
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          gap: 2,
          mb: 2 
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Team Management: <span style={{ color: theme.palette.primary.main }}>{myTeamName}</span>
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>

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

      {/* Action buttons row below greeting */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Plus size={18} />}
          onClick={handleOpenAddReq}
          sx={{ borderRadius: '8px', fontSize: '0.8rem', py: 0.5 }}
        >
          Add Job Opening
        </Button>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<Plus size={18} />}
          onClick={() => navigate('/candidates/create')}
          sx={{ borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', py: 0.5 }}
        >
          Add Candidate
        </Button>
      </Box>

      {currentUser && (
        <Box sx={{ mt: 3, mb: 3 }}>
          <HierarchyReport rootEmail={currentUser.email} startDate={startDate} endDate={endDate} />
        </Box>
      )}



      {/* UPDATE STATUS DIALOG */}
      <Dialog
        open={statusUpdateApp !== null}
        onClose={() => setStatusUpdateApp(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: '16px', p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: `1px solid ${theme.palette.divider}`, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RefreshCw size={20} style={{ color: theme.palette.text.primary }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Update Status</Typography>
          </Box>
          <Chip
            label={statusUpdateApp?.status || 'Unknown'}
            color="primary"
            variant="outlined"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent>
          {statusUpdateApp && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {statusUpdateApp.candidate_name || 'No Candidate Assigned'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {statusUpdateApp.position} @ {statusUpdateApp.client_name}
              </Typography>

              <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                STATUS
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 3 }}>
                <Select
                  value={statusUpdateValue}
                  onChange={(e) => setStatusUpdateValue(e.target.value as ApplicationStatus)}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value="New">New</MenuItem>
                  <MenuItem value="Submitted">Submitted</MenuItem>
                  <MenuItem value="Placed">Placed</MenuItem>
                  <MenuItem value="Under Review">Under Review</MenuItem>
                  <MenuItem value="Interview Scheduled">Interview Scheduled</MenuItem>
                  <MenuItem value="Interview Completed">Interview Completed</MenuItem>
                  <MenuItem value="Selected">Selected</MenuItem>
                  <MenuItem value="Rejected">Rejected</MenuItem>
                  <MenuItem value="On Hold">On Hold</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                </Select>
              </FormControl>

              {statusUpdateValue === 'Offer Sent' && (
                <Box sx={{ mb: 3, p: 2, border: `1px solid ${theme.palette.divider}`, borderRadius: '8px', bgcolor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
                    FINANCIAL DETAILS (REQUIRED FOR OFFER SENT)
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Pay Rate *"
                        placeholder="e.g. $50/hr or 10 LPA"
                        value={payRateInput}
                        onChange={(e) => setPayRateInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Variable Pay (Optional)"
                        placeholder="e.g. $10/hr"
                        value={variablePayInput}
                        onChange={(e) => setVariablePayInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Offer Value *"
                        placeholder="e.g. $10,000"
                        value={offerValueInput}
                        onChange={(e) => setOfferValueInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Profit Amount *"
                        placeholder="e.g. $15/hr"
                        value={profitAmountInput}
                        onChange={(e) => setProfitAmountInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Date of Join (Optional)"
                        InputLabelProps={{ shrink: true }}
                        value={dateOfJoinInput}
                        onChange={(e) => setDateOfJoinInput(e.target.value)}
                        InputProps={{ sx: { borderRadius: '8px' } }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}

              <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                COMMENTS
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder="Optional comments..."
                value={statusUpdateComment}
                onChange={(e) => setStatusUpdateComment(e.target.value)}
                InputProps={{ sx: { borderRadius: '8px' } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'flex-start' }}>
          <Button
            onClick={handleUpdateStatusSubmit}
            color="primary"
            variant="contained"
            disabled={
              statusUpdateValue === 'Offer Sent' &&
              (!payRateInput.trim() ||
                !offerValueInput.trim() ||
                !profitAmountInput.trim() ||
                !dateOfJoinInput.trim())
            }
            startIcon={<Check size={16} />}
            sx={{ borderRadius: '8px', fontWeight: 700, px: 3 }}
          >
            Update
          </Button>
          <Button
            onClick={() => setStatusUpdateApp(null)}
            variant="outlined"
            sx={{ borderRadius: '8px', fontWeight: 600, px: 3, color: 'text.secondary', borderColor: 'divider' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
