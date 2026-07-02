import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { ApiError } from '../../lib/error';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { OverdueChip } from '../../components/OverdueChip';
import { ProgressBadge } from '../../components/ProgressBadge';
import { useSnackbar } from '../../components/useSnackbar';
import { useAuth } from '../../auth/useAuth';
import { formatDateTime } from '../../lib/format';
import { paths } from '../../routes/paths';
import { taskActionErrorMessage } from './error-messages';
import { useDeleteTask, useTask, useUpdateTask } from './hooks';
import { ProgressControl } from './ProgressControl';
import { ReassignControl } from './ReassignControl';
import { TaskForm } from './TaskForm';
import type { UpdateTaskInput } from './types';

/**
 * KEYSTONE screen + record-level actions. `GET /tasks/:id` goes through the backend scoped-load: an
 * out-of-scope or missing id returns 404 RESOURCE_NOT_FOUND, rendered as a concise 404 that does NOT
 * reveal existence (docs/06 §3.2). Everything shown is the projection (docs/06 §8.2). Action buttons
 * are gated by ownership/assignment/role for UX ONLY (SEC-03) — the backend enforces every action and
 * a 403/404 surfaces as a toast + resync.
 */
export function TaskDetail({ id }: { id: string }) {
  const { identity } = useAuth();
  const { notify } = useSnackbar();
  const navigate = useNavigate();

  const { data: task, isPending, isError, error } = useTask(id);
  const updateMut = useUpdateTask(id);
  const deleteMut = useDeleteTask(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.code === 'RESOURCE_NOT_FOUND') {
      return <NotFoundView />;
    }
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'Đã xảy ra lỗi.'}
        requestId={error instanceof ApiError ? error.requestId : undefined}
      />
    );
  }

  const self = identity?.id;
  const isOwner = task.owner.id === self;
  const isAssignee = task.assignee.id === self;
  const isLeader = identity?.role === 'LEADER';
  const hasActions = isOwner || isAssignee || isLeader;

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync();
      notify('Đã xoá công việc.', 'success');
      navigate(paths.tasks);
    } catch (err) {
      setDeleteOpen(false);
      notify(taskActionErrorMessage(err));
    }
  };

  return (
    <Stack spacing={2}>
      <Button
        component={RouterLink}
        to={paths.tasks}
        sx={{ alignSelf: 'flex-start' }}
      >
        ← Danh sách công việc
      </Button>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
              {task.title}
            </Typography>
            <ProgressBadge progress={task.progress} />
            <OverdueChip overdue={task.overdue} />
          </Stack>

          <Typography
            color="text.secondary"
            sx={{ mt: 2, whiteSpace: 'pre-wrap' }}
          >
            {task.description || 'Không có mô tả.'}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1}>
            <Field label="Người giao (owner)" value={task.owner.name} />
            <Field label="Người được giao (assignee)" value={task.assignee.name} />
            <Field label="Hạn chót" value={formatDateTime(task.deadline)} />
            <Field label="Tạo lúc" value={formatDateTime(task.createdAt)} />
            <Field label="Cập nhật" value={formatDateTime(task.updatedAt)} />
          </Stack>
        </CardContent>
      </Card>

      {hasActions && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Hành động
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              {isAssignee && <ProgressControl task={task} />}
              {isLeader && <ReassignControl task={task} />}
              {isOwner && (
                <Button variant="outlined" onClick={() => setEditOpen(true)}>
                  Sửa
                </Button>
              )}
              {isOwner && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setDeleteOpen(true)}
                >
                  Xoá
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Sửa công việc</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TaskForm
              mode="edit"
              task={task}
              roster={[]}
              selfId={self ?? ''}
              isLeader={!!isLeader}
              submitting={updateMut.isPending}
              onSubmit={async (payload) => {
                await updateMut.mutateAsync(payload as UpdateTaskInput);
              }}
              onSuccess={() => setEditOpen(false)}
              onCancel={() => setEditOpen(false)}
            />
          </Box>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Xoá công việc"
        message="Bạn có chắc muốn xoá công việc này? Hành động này không thể hoàn tác."
        confirmLabel="Xoá"
        confirmColor="error"
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 220 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

/** Concise 404 for a foreign/missing task id — mirrors the app 404, inline. */
function NotFoundView() {
  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 8 }}>
      <Typography variant="h4">404</Typography>
      <Typography color="text.secondary">Không tìm thấy công việc.</Typography>
      <Button component={RouterLink} to={paths.tasks} variant="contained">
        Về danh sách
      </Button>
    </Stack>
  );
}
