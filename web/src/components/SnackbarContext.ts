import { createContext } from 'react';
import type { AlertColor } from '@mui/material';

/**
 * App-wide toast for transient/permission feedback on mutations (docs/09 §3.4). Split from the
 * provider component (mirrors auth/AuthContext) so react-refresh stays happy.
 */
export interface SnackbarContextValue {
  /** Show a toast. Defaults to 'error' — the common case (403/429/500 on a mutation). */
  notify: (message: string, severity?: AlertColor) => void;
}

export const SnackbarContext = createContext<SnackbarContextValue | null>(null);
