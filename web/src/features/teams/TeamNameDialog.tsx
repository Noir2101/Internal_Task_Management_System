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
import { useCreateTeam, useUpdateTeam } from './hooks';
import { teamActionErrorMessage } from './error-messages';
import type { Team } from './types';

/**
 * Create/rename team dialog (docs/09 §2.4). Body is `{name}` ONLY. TEAM_NAME_TAKEN and
 * VALIDATION_FAILED map to the name field; other codes → toast.
 */
const schema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên nhóm').max(200, 'Tối đa 200 ký tự'),
});
type FormValues = z.infer<typeof schema>;

export function TeamNameDialog({
  mode,
  team,
  onClose,
}: {
  mode: 'create' | 'rename';
  team?: Team;
  onClose: () => void;
}) {
  const { notify } = useSnackbar();
  const createMut = useCreateTeam();
  const updateMut = useUpdateTeam(team?.id ?? '');
  const activeMut = mode === 'create' ? createMut : updateMut;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: team?.name ?? '' },
  });

  const submit = handleSubmit(async (v) => {
    try {
      await activeMut.mutateAsync({ name: v.name.trim() });
      notify(mode === 'create' ? 'Đã tạo nhóm.' : 'Đã đổi tên nhóm.', 'success');
      onClose();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'VALIDATION_FAILED' || err.code === 'TEAM_NAME_TAKEN')
      ) {
        const detail = err.details?.find((d) => d.field === 'name');
        setError('name', {
          message: detail?.constraint ?? 'Tên nhóm này đã tồn tại.',
        });
        return;
      }
      notify(teamActionErrorMessage(err));
    }
  });

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{mode === 'create' ? 'Tạo nhóm' : 'Đổi tên nhóm'}</DialogTitle>
      <form onSubmit={submit} noValidate>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Tên nhóm"
              fullWidth
              autoFocus
              {...register('name')}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={activeMut.isPending}>
            Huỷ
          </Button>
          <Button type="submit" variant="contained" disabled={activeMut.isPending}>
            {mode === 'create' ? 'Tạo' : 'Lưu'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
