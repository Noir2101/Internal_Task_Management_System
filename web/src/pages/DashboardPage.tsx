import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { ApiError } from '../lib/error';
import { ErrorState } from '../components/ErrorState';
import { useStats } from '../features/stats/hooks';
import { StatCards } from '../features/stats/StatCards';
import { ByProgressChart } from '../features/stats/ByProgressChart';
import { ByAssigneeChart } from '../features/stats/ByAssigneeChart';

/**
 * Leader dashboard (docs/09 §2.3). Scope is derived server-side from the JWT — no teamId param.
 * KPIs + byProgress bar + byAssignee stacked bar (with companion table). Overdue is a separate KPI.
 */
export function DashboardPage() {
  const { data: stats, isPending, isError, error } = useStats();

  if (isError) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'Không tải được thống kê.'}
        requestId={error instanceof ApiError ? error.requestId : undefined}
      />
    );
  }
  if (isPending || !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nhóm: {stats.scope.teamName}
        </Typography>
      </Box>

      <StatCards stats={stats} />

      {stats.total === 0 ? (
        <Typography color="text.secondary">Nhóm chưa có công việc nào.</Typography>
      ) : (
        <Stack spacing={3}>
          <Paper sx={{ p: 2 }}>
            <ByProgressChart stats={stats} />
          </Paper>
          <Paper sx={{ p: 2 }}>
            <ByAssigneeChart stats={stats} />
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
