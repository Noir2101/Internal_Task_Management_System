import { AxiosError } from 'axios';

/**
 * Error envelope shape from the backend (docs/06 §7). Success responses are NOT enveloped;
 * only errors carry this. FE branches ONLY on `code` — `message`/`error` are for humans and
 * may change or be translated. `details[]` exists only for VALIDATION_FAILED.
 */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: ErrorDetail[];
  timestamp: string;
  path: string;
  requestId: string;
}

export interface ErrorDetail {
  field: string;
  constraint: string;
}

/**
 * Normalized error every call site can branch on via `code`. The api-client response
 * interceptor converts every axios failure into one of these, so callers never touch axios.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly details?: ErrorDetail[];
  readonly requestId?: string;

  constructor(envelope: {
    code: string;
    message?: string;
    statusCode?: number;
    details?: ErrorDetail[];
    requestId?: string;
  }) {
    super(envelope.message ?? envelope.code);
    this.name = 'ApiError';
    this.code = envelope.code;
    this.statusCode = envelope.statusCode;
    this.details = envelope.details;
    this.requestId = envelope.requestId;
  }
}

/** Synthetic code when the request never reached the backend (offline, DNS, CORS, timeout). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

function isErrorEnvelope(data: unknown): data is ErrorEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Record<string, unknown>).code === 'string'
  );
}

/** Parse an axios error into an ApiError. Missing/malformed body → NETWORK_ERROR. */
export function parseApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (isErrorEnvelope(data)) {
      return new ApiError({
        code: data.code,
        message: data.message,
        statusCode: data.statusCode,
        details: data.details,
        requestId: data.requestId,
      });
    }
    return new ApiError({
      code: NETWORK_ERROR,
      message: error.message,
      statusCode: error.response?.status,
    });
  }

  return new ApiError({
    code: NETWORK_ERROR,
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
