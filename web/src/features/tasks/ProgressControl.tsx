import { MenuItem, TextField } from '@mui/material';
import { useSnackbar } from '../../components/useSnackbar';
import { taskActionErrorMessage } from './error-messages';
import { useUpdateProgress } from './hooks';
import { PROGRESS_VALUES } from './types';
import type { Progress, Task } from './types';

/**
 * Assignee-only progress control (docs/06 §4.3). any→any, NO state machine. The Select is controlled
 * by the server value; on success invalidation refetches, on 403 the resync snaps it back. Shown only
 * when self is the assignee (UX gate) — the backend still enforces (SEC-03).
 */
export function ProgressControl({ task }: { task: Task }) {
  const { notify } = useSnackbar();
  const mut = useUpdateProgress(task.id);

  const handleChange = async (next: Progress) => {
    if (next === task.progress) return;
    try {
      await mut.mutateAsync(next);
      notify('Đã cập nhật tiến độ.', 'success');
    } catch (err) {
      notify(taskActionErrorMessage(err));
    }
  };

  return (
    <TextField
      select
      label="Đổi tiến độ"
      size="small"
      sx={{ minWidth: 200 }}
      value={task.progress}
      disabled={mut.isPending}
      onChange={(e) => handleChange(e.target.value as Progress)}
    >
      {PROGRESS_VALUES.map((p) => (
        <MenuItem key={p} value={p}>
          {p}
        </MenuItem>
      ))}
    </TextField>
  );
}
