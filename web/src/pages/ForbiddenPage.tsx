import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/** 403 view for the UX role gate (RoleRoute). Backend remains the real authority (SEC-03). */
export function ForbiddenPage() {
  return (
    <Box sx={{ py: 8 }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h4">403</Typography>
        <Typography color="text.secondary">
          Bạn không có quyền truy cập trang này.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Về trang chính
        </Button>
      </Stack>
    </Box>
  );
}
