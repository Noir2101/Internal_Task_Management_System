import { Alert, AlertTitle, Box, Typography } from '@mui/material';

/**
 * Generic error surface. Shows the human message and, for 500s, the `requestId` so a user can quote
 * it when reporting (docs/09 §3.4). Never renders raw stack traces.
 */
export function ErrorState({
  message,
  requestId,
}: {
  message: string;
  requestId?: string;
}) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">
        <AlertTitle>Đã xảy ra lỗi</AlertTitle>
        <Typography variant="body2">{message}</Typography>
        {requestId && (
          <Typography variant="caption" color="text.secondary">
            Mã lỗi: {requestId}
          </Typography>
        )}
      </Alert>
    </Box>
  );
}
