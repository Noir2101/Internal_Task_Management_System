import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Link as MuiLink,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ApiError } from '../../lib/error';
import { ErrorState } from '../../components/ErrorState';
import { ProgressBadge } from '../../components/ProgressBadge';
import { OverdueChip } from '../../components/OverdueChip';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../auth/useAuth';
import { paths } from '../../routes/paths';
import { TaskFilters, type TaskFiltersValue } from './TaskFilters';
import { useRoster, useTasks } from './hooks';
import type { ListTasksParams } from './types';

const LIMIT = 20;

/**
 * Team task list (docs/06 §4). Scope is server-derived — there is NO teamId param (docs/09 §3.5). The
 * two axes are independent controls combined AND server-side. `lockedFilter` fixes the assignee (the
 * my-tasks seam, docs/09 §4) without a dedicated route.
 */
export function TaskList({ lockedFilter }: { lockedFilter?: { assigneeId: string } }) {
  const { identity } = useAuth();
  const { data: roster = [] } = useRoster(identity?.teamId ?? null);

  const [filters, setFilters] = useState<TaskFiltersValue>({
    progress: '',
    overdue: 'all',
    assigneeId: '',
    q: '',
  });
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the search box so keystrokes don't hammer the API (docs/09 §2.2).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 350);
    return () => clearTimeout(t);
  }, [filters.q]);

  // Any filter change resets to page 1 so results aren't stranded on a now-empty page.
  const patchFilters = (patch: Partial<TaskFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const params: ListTasksParams = useMemo(
    () => ({
      progress: filters.progress || undefined,
      // Tri-state → boolean: 'all' omits the param; the two axes stay separate (docs/09 §3.5).
      overdue: filters.overdue === 'all' ? undefined : filters.overdue === 'overdue',
      assigneeId: lockedFilter?.assigneeId ?? (filters.assigneeId || undefined),
      q: debouncedQ || undefined,
      page,
      limit: LIMIT,
    }),
    [
      filters.progress,
      filters.overdue,
      filters.assigneeId,
      lockedFilter?.assigneeId,
      debouncedQ,
      page,
    ],
  );

  const { data, isError, error, isFetching } = useTasks(params);

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
    // DONE + "chỉ quá hạn" is a guaranteed-empty intersection (overdue excludes DONE) — explain it
    // instead of a generic empty message, without coupling the two independent filter axes.
    const doneOverdueCombo =
      filters.progress === 'DONE' && filters.overdue === 'overdue';
    content = (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        {doneOverdueCombo
          ? 'Việc đã hoàn thành không bao giờ ở trạng thái quá hạn.'
          : 'Không có công việc phù hợp.'}
      </Typography>
    );
  } else {
    content = (
      <>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tiêu đề</TableCell>
                <TableCell>Tiến độ</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Người giao</TableCell>
                <TableCell>Người được giao</TableCell>
                <TableCell>Hạn chót</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((task) => (
                <TableRow key={task.id} hover>
                  <TableCell>
                    <MuiLink
                      component={RouterLink}
                      to={paths.taskDetail(task.id)}
                      underline="hover"
                    >
                      {task.title}
                    </MuiLink>
                  </TableCell>
                  <TableCell>
                    <ProgressBadge progress={task.progress} />
                  </TableCell>
                  <TableCell>
                    <OverdueChip overdue={task.overdue} />
                  </TableCell>
                  <TableCell>{task.owner.name}</TableCell>
                  <TableCell>{task.assignee.name}</TableCell>
                  <TableCell>{formatDateTime(task.deadline)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mt: 2 }}
        >
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
          Công việc
        </Typography>
        <Button component={RouterLink} to={paths.taskNew} variant="contained">
          Tạo công việc
        </Button>
      </Stack>

      <TaskFilters
        value={filters}
        roster={roster}
        hideAssignee={!!lockedFilter}
        onChange={patchFilters}
      />

      {/* Keep the filter bar visible while refetching; only a thin progress bar moves. */}
      <Box sx={{ height: 4 }}>{isFetching && <LinearProgress />}</Box>

      {content}
    </Stack>
  );
}
