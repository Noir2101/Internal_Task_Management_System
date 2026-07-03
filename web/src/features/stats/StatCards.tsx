import { Box, Paper, Stack, Typography } from '@mui/material';
import type { StatsResponse } from './types';
import { OVERDUE_COLOR, PROGRESS_COLOR, PROGRESS_ORDER } from './colors';

/**
 * KPI row (docs/09 §2.3). Total + the 3 progress buckets + overdue. Overdue is a SEPARATE red tile,
 * outside `total`, never a 4th progress bucket (docs/09 §3.5). Progress tiles carry a color dot that
 * ties them to the charts; identity is never color-alone (each tile is labeled).
 */
function StatCard({
  label,
  value,
  dotColor,
  emphasis = false,
}: {
  label: string;
  value: number;
  dotColor?: string;
  emphasis?: boolean;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        flex: '1 1 150px',
        minWidth: 140,
        borderTop: emphasis ? `3px solid ${OVERDUE_COLOR}` : undefined,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        {dotColor && (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: dotColor }} />
        )}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" sx={{ color: emphasis ? OVERDUE_COLOR : 'text.primary' }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function StatCards({ stats }: { stats: StatsResponse }) {
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
      <StatCard label="Tổng công việc" value={stats.total} />
      {PROGRESS_ORDER.map((k) => (
        <StatCard key={k} label={k} value={stats.byProgress[k]} dotColor={PROGRESS_COLOR[k]} />
      ))}
      <StatCard label="Quá hạn" value={stats.overdue} emphasis />
    </Stack>
  );
}
