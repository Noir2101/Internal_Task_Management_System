import { createContext } from 'react';
import type { Identity } from './types';

export interface AuthContextValue {
  /** Current signed-in identity, or null when logged out. */
  identity: Identity | null;
  /** True during the initial refresh→me bootstrap (docs/09 §3.3). */
  booting: boolean;
  login: (email: string, password: string) => Promise<Identity>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
