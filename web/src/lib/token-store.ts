/**
 * Access token lives ONLY in module memory (RAM) — never localStorage/sessionStorage (docs/06 §6.1,
 * docs/09 §3.5). This is the anti-XSS choice: a reload loses the token and the app rehydrates via the
 * refresh cookie. The store is a plain module (not React) so the axios interceptor can read/set it
 * without a hook.
 */
let accessToken: string | null = null;

/** Called by the interceptor when the session is unrecoverable (refresh failed → SESSION_EXPIRED).
 *  AuthProvider registers a handler that drops identity, so ProtectedRoute redirects to /login. */
let onUnauthenticated: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function registerOnUnauthenticated(cb: () => void): void {
  onUnauthenticated = cb;
}

export function notifyUnauthenticated(): void {
  onUnauthenticated?.();
}
