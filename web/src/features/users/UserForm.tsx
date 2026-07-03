import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { ApiError } from '../../lib/error';
import { useSnackbar } from '../../components/useSnackbar';
import type { Team } from '../teams/types';
import { userActionErrorMessage } from './error-messages';
import { ROLE_VALUES } from './types';
import type { CreateUserInput } from './types';
import { ROLE_LABELS } from '../../lib/labels';

/**
 * Admin create-user form (docs/09 §2.4). Zod mirrors the DTO's FORMAL rules only (docs/06 §8.1):
 * email, name ≤200, password ≥8 (min only — no complexity, matching the backend), role enum. The
 * admin↔team invariant is enforced BOTH ways client-side: teamId is shown+required for LEADER/MEMBER
 * and hidden+never-sent for ADMIN (anti mass-assignment). Server still owns the rule — a mismatch
 * comes back as VALIDATION_FAILED (field `role`). EMAIL_TAKEN maps to the email field; other codes → toast.
 */
const schema = z
  .object({
    email: z.string().trim().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
    name: z.string().trim().min(1, 'Vui lòng nhập tên').max(200, 'Tối đa 200 ký tự'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    role: z.enum(['ADMIN', 'LEADER', 'MEMBER']),
    teamId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.role !== 'ADMIN' && !v.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamId'],
        message: 'Vui lòng chọn nhóm',
      });
    }
  });
type FormValues = z.infer<typeof schema>;

const FIELDS: readonly (keyof FormValues)[] = ['email', 'name', 'password', 'role', 'teamId'];

export function UserForm({
  teams,
  submitting,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  teams: Team[];
  submitting: boolean;
  onSubmit: (input: CreateUserInput) => Promise<unknown>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { notify } = useSnackbar();
  const {
    register,
    control,
    watch,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', name: '', password: '', role: 'MEMBER', teamId: '' },
  });

  const role = watch('role');
  const needsTeam = role !== 'ADMIN';

  const buildCreate = (v: FormValues): CreateUserInput => {
    const base: CreateUserInput = {
      email: v.email.trim(),
      name: v.name.trim(),
      password: v.password,
      role: v.role,
    };
    // ADMIN carries NO teamId (server-derived null); LEADER/MEMBER must include it.
    return v.role === 'ADMIN' ? base : { ...base, teamId: v.teamId };
  };

  const submit = handleSubmit(async (v) => {
    try {
      await onSubmit(buildCreate(v));
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
        if (err.code === 'EMAIL_TAKEN') {
          setError('email', { message: 'Email này đã được sử dụng.' });
          return;
        }
        notify(userActionErrorMessage(err));
        return;
      }
      notify('Không thể kết nối máy chủ. Vui lòng thử lại.');
    }
  });

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={2} sx={{ maxWidth: 480 }}>
        <TextField
          label="Email"
          fullWidth
          autoFocus
          {...register('email')}
          error={!!errors.email}
          helperText={errors.email?.message}
        />
        <TextField
          label="Tên"
          fullWidth
          {...register('name')}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          label="Mật khẩu"
          type="password"
          fullWidth
          {...register('password')}
          error={!!errors.password}
          helperText={errors.password?.message ?? 'Tối thiểu 8 ký tự.'}
        />
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <TextField {...field} select label="Vai trò" fullWidth>
              {ROLE_VALUES.map((r) => (
                <MenuItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {needsTeam && (
          <Controller
            name="teamId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Nhóm"
                fullWidth
                error={!!errors.teamId}
                helperText={errors.teamId?.message}
              >
                {teams.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )}

        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={submitting}>
            Tạo
          </Button>
          <Button onClick={onCancel} disabled={submitting}>
            Huỷ
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
