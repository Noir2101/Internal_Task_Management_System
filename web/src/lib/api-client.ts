import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { parseApiError, type ErrorEnvelope } from './error';
import {
  clearAccessToken,
  getAccessToken,
  notifyUnauthenticated,
  setAccessToken,
} from './token-store';

/**
 * The single api-client (docs/09 §3.2). Relative baseURL keeps the same-origin seam (Vite proxy in
 * dev, reverse-proxy in prod). `withCredentials` lets the HttpOnly refresh cookie ride /auth/* calls.
 */
export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

/** Request interceptor: attach the RAM access token as a Bearer header when present. */
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Deduped in-flight refresh: concurrent 401s await the same POST /auth/refresh (docs/06 §6.4).
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Response interceptor — refresh-retry-once (docs/06 §6.4):
 *   401 + code TOKEN_EXPIRED/TOKEN_INVALID (and not already retried, not the refresh call itself)
 *   → refresh once (deduped) → retry the original request once.
 *   Refresh fails (SESSION_EXPIRED) → clear token + notify → redirect to /login via ProtectedRoute.
 * Every other failure is converted to an ApiError so call sites branch only on `code`.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorEnvelope>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isTokenError =
      status === 401 && (code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID');
    const isRefreshCall = config?.url?.includes('/auth/refresh') ?? false;

    if (isTokenError && config && !config._retry && !isRefreshCall) {
      config._retry = true;
      try {
        await refreshAccessToken();
        // Request interceptor re-attaches the new token on retry.
        return await apiClient(config);
      } catch (refreshError) {
        clearAccessToken();
        notifyUnauthenticated();
        return Promise.reject(parseApiError(refreshError));
      }
    }

    return Promise.reject(parseApiError(error));
  },
);
