import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { ApiError } from '../../lib/error';
import { useSnackbar } from '../../components/useSnackbar';
import { useUpdateUser } from './hooks';
import { userActionErrorMessage } from './error-messages';
import type { User } from './types';

/**
 * Edit-name dialog (docs/09 §2.4). PATCH /users/:id accepts ONLY `name` — role/teamId are immutable
 * post-create, so they are not rendered or sent (anti mass-assignment). VALIDATION_FAILED → field error.
 */
const schema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(200, 'Tối đa 200 ký tự'),
});
type FormValues = z.infer<typeof schema>;

export function UserEditDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { notify } = useSnackbar();
  const updateMut = useUpdateUser(user.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
  });

  const submit = handleSubmit(async (v) => {
    try {
      await updateMut.mutateAsync({ name: v.name.trim() });
      notify('Đã cập nhật tên.', 'success');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        for (const d of err.details ?? []) {
          if (d.field === 'name') setError('name', { message: d.constraint });
        }
        return;
      }
      notify(userActionErrorMessage(err));
    }
  });

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Sửa tên người dùng</DialogTitle>
      <form onSubmit={submit} noValidate>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Tên"
              fullWidth
              autoFocus
              {...register('name')}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={updateMut.isPending}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={updateMut.isPending}>
            Lưu
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
