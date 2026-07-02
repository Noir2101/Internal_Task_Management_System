import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/** Concise 404 view — does not reveal whether a resource exists (docs/06 §3.2). */
export function NotFoundPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack spacing={2} alignItems="center">
        <Typography variant="h4">404</Typography>
        <Typography color="text.secondary">Không tìm thấy trang.</Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Về trang chính
        </Button>
      </Stack>
    </Box>
  );
}
