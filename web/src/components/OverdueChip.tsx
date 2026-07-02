import { Chip } from '@mui/material';

/**
 * The OVERDUE axis as its OWN chip (docs/09 §3.5, two-axis) — never a 4th progress value. Renders
 * only when `overdue`; on-time tasks show nothing here. `overdue` is computed server-side.
 */
export function OverdueChip({ overdue }: { overdue: boolean }) {
  if (!overdue) return null;
  return <Chip label="Quá hạn" color="error" size="small" variant="outlined" />;
}
