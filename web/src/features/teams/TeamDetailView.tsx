import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError } from '../../lib/error';
import { ROLE_LABELS } from '../../lib/labels';
import { ErrorState } from '../../components/ErrorState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useSnackbar } from '../../components/useSnackbar';
import { paths } from '../../routes/paths';
import { useUsers } from '../users/hooks';
import { useDeleteTeam, useSetLeader, useTeam } from './hooks';
import { teamActionErrorMessage } from './error-messages';

/**
 * Admin team detail (docs/09 §2.4). Member list + leader picker are sourced from GET /users?teamId
 * (admin-accessible; returns role+isActive) because GET /teams/:id/members 404s for admins. Leader
 * swap = PUT /teams/:id/leader (userId must be an active member). Break-glass DELETE → 204 (empty) or
 * 409 TEAM_NOT_EMPTY.
 */
export function TeamDetailView({ teamId }: { teamId: string }) {
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  const { data: team, isPending: teamPending, isError: teamError, error: teamErr } = useTeam(teamId);
  const { data: usersResult } = useUsers({ teamId, limit: 100 });

  const members = usersResult?.data ?? [];
  const currentLeader = members.find((m) => m.role === 'LEADER') ?? null;
  const candidates = members.filter((m) => m.id !== currentLeader?.id);

  const [selectedId, setSelectedId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setLeaderMut = useSetLeader(teamId);
  const deleteMut = useDeleteTeam(teamId);

  const submitLeader = async () => {
    if (!selectedId) return;
    try {
      await setLeaderMut.mutateAsync(selectedId);
      notify('Đã đổi trưởng nhóm.', 'success');
      setSelectedId('');
    } catch (err) {
      notify(teamActionErrorMessage(err));
    }
  };

  const runDelete = async () => {
    try {
      await deleteMut.mutateAsync();
      notify('Đã giải thể nhóm.', 'success');
      navigate(paths.adminTeams);
    } catch (err) {
      notify(teamActionErrorMessage(err));
      setConfirmDelete(false);
    }
  };

  if (teamError) {
    const notFound = teamErr instanceof ApiError && teamErr.code === 'RESOURCE_NOT_FOUND';
    return (
      <ErrorState
        message={notFound ? 'Không tìm thấy nhóm.' : 'Đã xảy ra lỗi khi tải nhóm.'}
        requestId={teamErr instanceof ApiError ? teamErr.requestId : undefined}
      />
    );
  }
  if (teamPending || !team) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <MuiLink component={RouterLink} to={paths.adminTeams} underline="hover" variant="body2">
          ← Danh sách nhóm
        </MuiLink>
        <Typography variant="h4" component="h1" sx={{ mt: 1 }}>
          {team.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Trưởng nhóm hiện tại: {currentLeader ? currentLeader.name : 'Chưa có'}
        </Typography>
      </Box>

      {/* Members (active) */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Thành viên đang hoạt động
        </Typography>
        {members.length === 0 ? (
          <Typography color="text.secondary">Nhóm chưa có thành viên đang hoạt động.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tên</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Vai trò</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ROLE_LABELS[m.role]}
                        color={m.role === 'LEADER' ? 'primary' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Leader swap */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Đổi trưởng nhóm
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Chọn một thành viên đang hoạt động để giao vai trò trưởng nhóm (hoán đổi nguyên tử).
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <TextField
            select
            label="Thành viên"
            size="small"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            sx={{ minWidth: 240 }}
            disabled={candidates.length === 0}
          >
            {candidates.length === 0 ? (
              <MenuItem value="" disabled>
                Không có thành viên phù hợp
              </MenuItem>
            ) : (
              candidates.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))
            )}
          </TextField>
          <Button
            variant="contained"
            onClick={submitLeader}
            disabled={!selectedId || setLeaderMut.isPending}
          >
            Đặt làm trưởng nhóm
          </Button>
        </Stack>
      </Paper>

      {/* Break-glass */}
      <Paper sx={{ p: 2, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
        <Typography variant="h6" color="error" gutterBottom>
          Giải thể nhóm
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Chỉ dùng khi khẩn cấp (break-glass). Chỉ giải thể được nhóm chưa từng có thành viên — nếu còn
          thành viên (kể cả đã vô hiệu) sẽ báo lỗi.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Button color="error" variant="outlined" onClick={() => setConfirmDelete(true)}>
          Giải thể nhóm này
        </Button>
      </Paper>

      <ConfirmDialog
        open={confirmDelete}
        title="Giải thể nhóm"
        message={`Giải thể nhóm "${team.name}"? Thao tác này không thể hoàn tác.`}
        confirmLabel="Giải thể"
        confirmColor="error"
        loading={deleteMut.isPending}
        onConfirm={runDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Stack>
  );
}
