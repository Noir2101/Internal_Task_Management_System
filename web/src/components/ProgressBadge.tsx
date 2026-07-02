import { Chip } from '@mui/material';
import type { Progress } from '../features/tasks/types';

/** Color per progress value. Kept minimal (NFR-UX). */
const COLOR: Record<Progress, 'default' | 'info' | 'success'> = {
  TODO: 'default',
  IN_PROGRESS: 'info',
  DONE: 'success',
};

/** Renders the progress axis VERBATIM (docs/09 §3.5 — no translation layer), color-coded. */
export function ProgressBadge({ progress }: { progress: Progress }) {
  return <Chip label={progress} color={COLOR[progress]} size="small" />;
}
