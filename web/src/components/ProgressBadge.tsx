import { Chip } from '@mui/material';
import type { Progress } from '../features/tasks/types';
import { PROGRESS_LABELS } from '../lib/labels';

/** Color per progress value. Kept minimal (NFR-UX). */
const COLOR: Record<Progress, 'default' | 'info' | 'success'> = {
  TODO: 'default',
  IN_PROGRESS: 'info',
  DONE: 'success',
};

/**
 * Renders the progress axis, color-coded. The VALUE stays the enum on the wire (docs/09 §3.5); only the
 * shown text is the friendly label from the presentation map (lib/labels.ts).
 */
export function ProgressBadge({ progress }: { progress: Progress }) {
  return <Chip label={PROGRESS_LABELS[progress]} color={COLOR[progress]} size="small" />;
}
