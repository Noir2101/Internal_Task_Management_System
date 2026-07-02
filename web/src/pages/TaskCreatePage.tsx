import { useNavigate } from 'react-router-dom';
import { Stack, Typography } from '@mui/material';
import { useAuth } from '../auth/useAuth';
import { TaskForm } from '../features/tasks/TaskForm';
import { useCreateTask, useRoster } from '../features/tasks/hooks';
import type { CreateTaskInput } from '../features/tasks/types';
import { paths } from '../routes/paths';

/** Create screen. Member self-assigns; leader picks from the roster (loaded only for leaders). */
export function TaskCreatePage() {
  const { identity } = useAuth();
  const navigate = useNavigate();
  const createMut = useCreateTask();
  const isLeader = identity?.role === 'LEADER';
  const { data: roster = [] } = useRoster(
    isLeader ? identity?.teamId ?? null : null,
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Tạo công việc
      </Typography>
      <TaskForm
        mode="create"
        roster={roster}
        selfId={identity!.id}
        isLeader={isLeader}
        submitting={createMut.isPending}
        onSubmit={async (payload) => {
          await createMut.mutateAsync(payload as CreateTaskInput);
        }}
        onSuccess={() => navigate(paths.tasks)}
        onCancel={() => navigate(paths.tasks)}
      />
    </Stack>
  );
}
