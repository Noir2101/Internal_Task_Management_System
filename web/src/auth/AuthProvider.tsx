import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  clearAccessToken,
  registerOnUnauthenticated,
  setAccessToken,
} from '../lib/token-store';
import { apiLogin, apiLogout, apiMe, apiRefresh } from './api';
import { AuthContext, type AuthContextValue } from './AuthContext';
import type { Identity } from './types';

/**
 * Owns the auth session: identity state + the refresh→me bootstrap that survives a reload
 * (access token is RAM-only, so a reload loses it — docs/09 §3.3). Registers the interceptor's
 * "unauthenticated" callback so a failed refresh drops identity and ProtectedRoute redirects.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [booting, setBooting] = useState(true);
  const bootstrapped = useRef(false);

  useEffect(() => {
    registerOnUnauthenticated(() => setIdentity(null));
  }, []);

  // Bootstrap must fire EXACTLY once (docs/09 §3.3). A ref guard neutralizes React StrictMode's
  // dev double-invoke: two concurrent POST /auth/refresh calls would replay the same rotating
  // cookie and trip the backend's reuse-detection, revoking the whole token family (docs/06 §6.4).
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      try {
        const { accessToken } = await apiRefresh();
        setAccessToken(accessToken);
        const user = await apiMe();
        setIdentity(user);
      } catch {
        clearAccessToken();
        setIdentity(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<Identity> => {
      const { accessToken, user } = await apiLogin(email, password);
      setAccessToken(accessToken);
      setIdentity(user);
      return user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Best-effort: drop the local session even if the server call fails.
    } finally {
      clearAccessToken();
      setIdentity(null);
    }
  }, []);

  const value: AuthContextValue = { identity, booting, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
