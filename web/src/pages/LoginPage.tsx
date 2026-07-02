import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../lib/error';
import { roleLanding } from '../routes/paths';

const schema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type FormValues = z.infer<typeof schema>;

const FIELDS: readonly (keyof FormValues)[] = ['email', 'password'];

export function LoginPage() {
  const { identity, login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // Bootstrap may have restored a session; don't show login to an authenticated user.
  if (identity) return <Navigate to={roleLanding(identity.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login(values.email, values.password);
      navigate(roleLanding(user.role), { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setFormError('Không thể kết nối máy chủ. Vui lòng thử lại.');
        return;
      }
      // Branch only on `code` (docs/09 §3.4).
      switch (err.code) {
        case 'VALIDATION_FAILED':
          for (const detail of err.details ?? []) {
            if ((FIELDS as readonly string[]).includes(detail.field)) {
              setError(detail.field as keyof FormValues, {
                message: detail.constraint,
              });
            }
          }
          break;
        case 'INVALID_CREDENTIALS':
        case 'ACCOUNT_DISABLED':
          // Generic — never reveal whether the email exists (docs/06 §6.3).
          setFormError('Email hoặc mật khẩu không đúng.');
          break;
        case 'RATE_LIMITED':
          setFormError('Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.');
          break;
        default:
          setFormError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
    }
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            Đăng nhập ITMS
          </Typography>
          <Box component="form" onSubmit={onSubmit} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {formError && (
                <Alert severity="error" role="alert">
                  {formError}
                </Alert>
              )}
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                fullWidth
                autoFocus
                {...register('email')}
                error={!!errors.email}
                helperText={errors.email?.message}
              />
              <TextField
                label="Mật khẩu"
                type="password"
                autoComplete="current-password"
                fullWidth
                {...register('password')}
                error={!!errors.password}
                helperText={errors.password?.message}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                data-testid="login-submit"
              >
                Đăng nhập
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
