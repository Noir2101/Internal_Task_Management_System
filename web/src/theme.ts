import { createTheme } from '@mui/material/styles';

/** Minimal MUI theme — simple over fancy (NFR-UX). Extended in later slices as needed. */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1565c0' },
  },
});
