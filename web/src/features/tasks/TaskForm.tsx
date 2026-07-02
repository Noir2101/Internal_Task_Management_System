import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { ApiError } from '../../lib/error';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useSnackbar } from '../../components/useSnackbar';
import { fromDateTimeLocalInput, toDateTimeLocalInput } from '../../lib/format';
import { taskActionErrorMessage } from './error-messages';
import type { CreateTaskInput, RosterMember, Task, UpdateTaskInput } from './types';

/**
 * Shared create/edit form (docs/09 §2.2/§3.4). Zod mirrors the DTO's FORMAL rules only (docs/06 §8.1);
 * business rules stay server-side. Owner/scope are NEVER in the payload (anti mass-assignment). On
 * create, member assignee is LOCKED to self (self id sent); leader picks from the roster. On edit,
 * only DIRTY fields are sent (absent=keep, empty description/deadline=null=clear) and assignee is
 * untouched here (reassign is a separate endpoint). PAST_DEADLINE_CONFIRMATION_REQUIRED → confirm →
 * resend with allowPastDeadline; VALIDATION_FAILED → field errors; other codes → toast.
 */
const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tiêu đề')
    .max(200, 'Tối đa 200 ký tự'),
  description: z.string().max(2000, 'Tối đa 2000 ký tự'),
  deadline: z.string(),
  assigneeId: z.string(),
});
type FormValues = z.infer<typeof schema>;

const FIELDS: readonly (keyof FormValues)[] = [
  'title',
  'description',
  'deadline',
  'assigneeId',
];

export function TaskForm({
  mode,
  task,
  roster,
  selfId,
  isLeader,
  submitting,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  task?: Task;
  roster: RosterMember[];
  selfId: string;
  isLeader: boolean;
  submitting: boolean;
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => Promise<unknown>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { notify } = useSnackbar();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<CreateTaskInput | UpdateTaskInput | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      deadline: toDateTimeLocalInput(task?.deadline ?? null),
      // Create: member locked to self, leader must pick. Edit: unused (assignee not editable here).
      assigneeId: mode === 'create' && !isLeader ? selfId : '',
    },
  });

  /** Send the payload; branch failures on `code`. PAST_DEADLINE opens the confirm dialog. */
  const runSubmit = async (payload: CreateTaskInput | UpdateTaskInput) => {
    try {
      await onSubmit(payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_FAILED') {
          for (const d of err.details ?? []) {
            if ((FIELDS as readonly string[]).includes(d.field)) {
              setError(d.field as keyof FormValues, { message: d.constraint });
            }
          }
          return;
        }
        if (err.code === 'PAST_DEADLINE_CONFIRMATION_REQUIRED') {
          setPending(payload);
          setConfirmOpen(true);
          return;
        }
        notify(taskActionErrorMessage(err));
        return;
      }
      notify('Không thể kết nối máy chủ. Vui lòng thử lại.');
    }
  };

  const buildCreate = (v: FormValues): CreateTaskInput => ({
    title: v.title.trim(),
    description: v.description === '' ? null : v.description,
    deadline: fromDateTimeLocalInput(v.deadline),
    assigneeId: isLeader ? v.assigneeId : selfId,
  });

  const buildEdit = (v: FormValues): UpdateTaskInput => {
    const patch: UpdateTaskInput = {};
    if (dirtyFields.title) patch.title = v.title.trim();
    if (dirtyFields.description) patch.description = v.description === '' ? null : v.description;
    if (dirtyFields.deadline) patch.deadline = fromDateTimeLocalInput(v.deadline);
    return patch;
  };

  const submit = handleSubmit(async (v) => {
    if (mode === 'create') {
      if (isLeader && !v.assigneeId) {
        setError('assigneeId', { message: 'Vui lòng chọn người được giao' });
        return;
      }
      await runSubmit(buildCreate(v));
      return;
    }
    const patch = buildEdit(v);
    if (Object.keys(patch).length === 0) {
      notify('Chưa có thay đổi nào.', 'info');
      return;
    }
    await runSubmit(patch);
  });

  const confirmPastDeadline = async () => {
    if (!pending) return;
    setConfirmOpen(false);
    await runSubmit({ ...pending, allowPastDeadline: true });
    setPending(null);
  };

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <TextField
          label="Tiêu đề"
          fullWidth
          autoFocus
          {...register('title')}
          error={!!errors.title}
          helperText={errors.title?.message}
        />
        <TextField
          label="Mô tả"
          fullWidth
          multiline
          minRows={3}
          {...register('description')}
          error={!!errors.description}
          helperText={errors.description?.message}
        />
        <TextField
          label="Hạn chót"
          type="datetime-local"
          fullWidth
          InputLabelProps={{ shrink: true }}
          {...register('deadline')}
          error={!!errors.deadline}
          helperText={errors.deadline?.message}
        />

        {mode === 'create' &&
          (isLeader ? (
            <Controller
              name="assigneeId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Người được giao"
                  fullWidth
                  error={!!errors.assigneeId}
                  helperText={errors.assigneeId?.message}
                >
                  {roster.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          ) : (
            <TextField
              label="Người được giao"
              value="Chính bạn"
              fullWidth
              disabled
              helperText="Thành viên chỉ có thể tự giao việc."
            />
          ))}

        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={submitting}>
            {mode === 'create' ? 'Tạo' : 'Lưu'}
          </Button>
          <Button onClick={onCancel} disabled={submitting}>
            Huỷ
          </Button>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        title="Hạn chót ở quá khứ"
        message="Hạn chót bạn đặt nằm trong quá khứ. Bạn vẫn muốn tiếp tục?"
        confirmLabel="Vẫn tạo"
        loading={submitting}
        onConfirm={confirmPastDeadline}
        onCancel={() => {
          setConfirmOpen(false);
          setPending(null);
        }}
      />
    </Box>
  );
}
