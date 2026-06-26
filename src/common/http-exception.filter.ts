import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException, ErrorDetail } from './exceptions/app.exception';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: ErrorDetail[];
  timestamp: string;
  path: string;
  requestId: string;
}

/** HTTP reason-phrase cho field `error` (chỉ để người đọc; FE không rẽ nhánh trên nó). */
const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/** Built-in HttpException → code chung trong registry (docs/06 §7.3). */
const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Filter toàn cục → envelope thống nhất {statusCode,error,code,message,timestamp,path,requestId}.
 * - AppException: dùng code/status/message của nó (+ details nếu là ValidationException).
 * - HttpException built-in: map status→code chung; status lạ coi như gap nội bộ → 500.
 * - Khác: 500 INTERNAL_ERROR, log đầy đủ server-side; client không thấy stack/details.
 * Bước 7 cắm thêm nhánh Prisma-error (P2002…) vào đây.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = req.requestId ?? 'unknown';

    let status: number;
    let code: string;
    let message: string;
    let details: ErrorDetail[] | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      const rawStatus = exception.getStatus();
      const mapped = STATUS_CODE_MAP[rawStatus];
      if (mapped) {
        status = rawStatus;
        code = mapped;
        message = extractMessage(exception);
      } else {
        // Built-in không nằm trong registry → coi như gap nội bộ, đừng bịa code.
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_ERROR';
        message = 'Có lỗi xảy ra, vui lòng thử lại.';
        this.logger.warn(
          `[${requestId}] Unmapped HttpException status=${rawStatus}: ${extractMessage(exception)}`,
        );
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';
      message = 'Có lỗi xảy ra, vui lòng thử lại.';
      this.logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} — ${stringifyError(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorEnvelope = {
      statusCode: status,
      error: REASON_PHRASES[status] ?? 'Error',
      code,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      requestId,
    };

    res.status(status).json(body);
  }
}

function extractMessage(exception: HttpException): string {
  const r = exception.getResponse();
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object' && 'message' in r) {
    const m = r.message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return exception.message;
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
