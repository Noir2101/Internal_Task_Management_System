import { useState } from 'react';
import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { useAuth } from '../../auth/useAuth';
import { useSnackbar } from '../../components/useSnackbar';
import { taskActionErrorMessage } from './error-messages';
import { useReassignTask, useRoster } from './hooks';
import type { Task } from './types';

/**
 * Leader-only reassign (docs/06 §3.1). Picks a new assignee from the OWN-team roster; a deliberate
 * "Giao lại" click sends it. Shown only for leaders (UX gate); the backend enforces leader-only and
 * in-team membership (member callers → 403 TASK_MEMBER_SELF_ASSIGN_ONLY, off-team → TASK_ASSIGNEE_NOT_IN_TEAM).
 */
export function ReassignControl({ task }: { task: Task }) {
  const { identity } = useAuth();
  const { notify } = useSnackbar();
  const { data: roster = [] } = useRoster(identity?.teamId ?? null);
  const mut = useReassignTask(task.id);
  const [selected, setSelected] = useState(task.assignee.id);

  const handleReassign = async () => {
    if (selected === task.assignee.id) return;
    try {
      await mut.mutateAsync(selected);
      notify('Đã giao lại công việc.', 'success');
    } catch (err) {
      notify(taskActionErrorMessage(err));
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        select
        label="Giao lại cho"
        size="small"
        sx={{ minWidth: 200 }}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {roster.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.name}
          </MenuItem>
        ))}
      </TextField>
      <Button
        variant="outlined"
        onClick={handleReassign}
        disabled={mut.isPending || selected === task.assignee.id}
      >
        Giao lại
      </Button>
    </Stack>
  );
}
