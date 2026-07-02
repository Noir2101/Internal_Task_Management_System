import { Box, Chip, Stack, Typography } from '@mui/material';

/** Shared stub for screens built in later slices (docs/09 §6.2–6.3). */
export function Placeholder({ title, slice }: { title: string; slice: string }) {
  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h4">{title}</Typography>
        <Chip label={slice} color="default" size="small" />
      </Stack>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Màn hình này sẽ được xây ở slice sau.
      </Typography>
    </Box>
  );
}
