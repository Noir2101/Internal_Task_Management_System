import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Switch,
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
import { ErrorState } from '../../components/ErrorState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useSnackbar } from '../../components/useSnackbar';
import { useAuth } from '../../auth/useAuth';
import { paths } from '../../routes/paths';
import { useTeams } from '../teams/hooks';
import { useDeactivateUser, useReactivateUser, useUsers } from './hooks';
import { userActionErrorMessage } from './error-messages';
import { UserEditDialog } from './UserEditDialog';
import { ROLE_VALUES } from './types';
import { ROLE_LABELS } from '../../lib/labels';
import type { ListUsersParams, Role, User } from './types';

const LIMIT = 20;

const ROLE_COLOR: Record<Role, 'secondary' | 'primary' | 'default'> = {
  ADMIN: 'secondary',
  LEADER: 'primary',
  MEMBER: 'default',
};

interface Filters {
  // 'all' is the unfiltered sentinel (non-empty → the label shrinks without displayEmpty).
  role: 'all' | Role;
  teamId: string;
  includeInactive: boolean;
}

/** One user row owns its own edit dialog + deactivate/reactivate mutations (stable hook positions). */
function UserRow({ user, teamName, selfId }: { user: User; teamName: string; selfId: string }) {
  const { notify } = useSnackbar();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | null>(null);
  const deactivateMut = useDeactivateUser(user.id);
  const reactivateMut = useReactivateUser(user.id);
  const isSelf = user.id === selfId;

  const runDeactivate = async () => {
    try {
      await deactivateMut.mutateAsync();
      notify(
        `Đã vô hiệu hoá "${user.name}".`,
        'success',
      );
    } catch (err) {
      notify(userActionErrorMessage(err));
    } finally {
      setConfirm(null);
    }
  };

  const runReactivate = async () => {
    try {
      await reactivateMut.mutateAsync();
      notify(`Đã kích hoạt lại "${user.name}".`, 'success');
    } catch (err) {
      notify(userActionErrorMessage(err));
    } finally {
      setConfirm(null);
    }
  };

  return (
    <TableRow hover>
      <TableCell>{user.name}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <Chip size="small" label={ROLE_LABELS[user.role]} color={ROLE_COLOR[user.role]} />
      </TableCell>
      <TableCell>{teamName}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={user.isActive ? 'Hoạt động' : 'Vô hiệu'}
          color={user.isActive ? 'success' : 'default'}
          variant={user.isActive ? 'filled' : 'outlined'}
        />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => setEditOpen(true)}>
            Sửa tên
          </Button>
          {user.isActive ? (
            <Button
              size="small"
              color="error"
              disabled={isSelf}
              onClick={() => setConfirm('deactivate')}
            >
              Vô hiệu hoá
            </Button>
          ) : (
            <Button size="small" color="primary" onClick={() => setConfirm('reactivate')}>
              Kích hoạt lại
            </Button>
          )}
        </Stack>
      </TableCell>

      {editOpen && <UserEditDialog user={user} onClose={() => setEditOpen(false)} />}

      <ConfirmDialog
        open={confirm === 'deactivate'}
        title="Vô hiệu hoá người dùng"
        message={`Vô hiệu hoá "${user.name}"?`}
        confirmLabel="Vô hiệu hoá"
        confirmColor="error"
        loading={deactivateMut.isPending}
        onConfirm={runDeactivate}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        title="Kích hoạt lại người dùng"
        message={`Kích hoạt lại "${user.name}"?`}
        confirmLabel="Kích hoạt"
        loading={reactivateMut.isPending}
        onConfirm={runReactivate}
        onCancel={() => setConfirm(null)}
      />
    </TableRow>
  );
}

/**
 * Admin user list (docs/09 §2.4). Filters (role / team / includeInactive) AND server-side; sort is
 * fixed server-side (createdAt DESC). Team name is resolved from the teams list (teamId → name).
 */
export function UserList() {
  const { identity } = useAuth();
  const { data: teams = [] } = useTeams();
  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  const [filters, setFilters] = useState<Filters>({ role: 'all', teamId: 'all', includeInactive: false });
  const [page, setPage] = useState(1);

  const patchFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const params: ListUsersParams = useMemo(
    () => ({
      role: filters.role === 'all' ? undefined : filters.role,
      teamId: filters.teamId === 'all' ? undefined : filters.teamId,
      includeInactive: filters.includeInactive || undefined,
      page,
      limit: LIMIT,
    }),
    [filters.role, filters.teamId, filters.includeInactive, page],
  );

  const { data, isError, error, isFetching } = useUsers(params);

  let content: React.ReactNode;
  if (isError && !data) {
    content = (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'Đã xảy ra lỗi.'}
        requestId={error instanceof ApiError ? error.requestId : undefined}
      />
    );
  } else if (!data) {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  } else if (data.data.length === 0) {
    content = (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        Không có người dùng phù hợp.
      </Typography>
    );
  } else {
    content = (
      <>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tên</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Nhóm</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  teamName={user.teamId ? (teamName.get(user.teamId) ?? user.teamId) : '—'}
                  selfId={identity!.id}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Tổng: {data.meta.total}
          </Typography>
          <Pagination
            count={data.meta.totalPages}
            page={data.meta.page}
            onChange={(_e, p) => setPage(p)}
            color="primary"
          />
        </Stack>
      </>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center">
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          Người dùng
        </Typography>
        <Button component={RouterLink} to={paths.adminUserNew} variant="contained">
          Tạo người dùng
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <TextField
            select
            label="Vai trò"
            size="small"
            value={filters.role}
            onChange={(e) => patchFilters({ role: e.target.value as Filters['role'] })}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">Tất cả</MenuItem>
            {ROLE_VALUES.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Nhóm"
            size="small"
            value={filters.teamId}
            onChange={(e) => patchFilters({ teamId: e.target.value })}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="all">Tất cả</MenuItem>
            {teams.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={filters.includeInactive}
                onChange={(e) => patchFilters({ includeInactive: e.target.checked })}
              />
            }
            label="Gồm người bị vô hiệu"
          />
        </Stack>
      </Paper>

      <Box sx={{ height: 4 }}>{isFetching && <LinearProgress />}</Box>

      {content}
    </Stack>
  );
}
