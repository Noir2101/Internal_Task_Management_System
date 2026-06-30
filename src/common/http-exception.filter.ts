import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AppException, ErrorDetail } from './exceptions/app.exception';
import { ForbiddenError, NotFoundError } from './exceptions/domain.exception';

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
 * - Domain-exception (NotFoundError/ForbiddenError): map → 404 RESOURCE_NOT_FOUND / 403 + code cụ thể.
 * - HttpException built-in: map status→code chung; status lạ coi như gap nội bộ → 500.
 * - Prisma known-request-error: safety-net cho lỗi raw-constraint (P2002…) — xem `mapPrismaError`.
 * - Khác: 500 INTERNAL_ERROR, log đầy đủ server-side; client không thấy stack/details.
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
    } else if (exception instanceof NotFoundError) {
      // Domain-exception (framework-agnostic) → envelope. 404 luôn dùng code chung (docs/06 §7.3).
      status = HttpStatus.NOT_FOUND;
      code = 'RESOURCE_NOT_FOUND';
      message = exception.message;
    } else if (exception instanceof ForbiddenError) {
      // 403 mang code cụ thể từ registry (vd NOT_TASK_OWNER, FORBIDDEN).
      status = HttpStatus.FORBIDDEN;
      code = exception.code;
      message = exception.message;
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
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Bước 7 — lưới an toàn cho lỗi raw-constraint (đua-điều-kiện). Domain pre-check vẫn là đường
      // chính (service throw AppException trước). Không nhận diện được (null) → 500, KHÔNG bịa code.
      const mapped = mapPrismaError(exception);
      if (mapped) {
        status = mapped.status;
        code = mapped.code;
        message = mapped.message;
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_ERROR';
        message = 'Có lỗi xảy ra, vui lòng thử lại.';
        this.logger.warn(
          `[${requestId}] Unmapped Prisma error code=${exception.code} target=${normalizeTarget(exception.meta?.target) || '?'}`,
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

/** `meta.target` của P2002 là string | string[] | undefined → một chuỗi lowercase để match. */
function normalizeTarget(target: unknown): string {
  if (Array.isArray(target)) return target.join(',').toLowerCase();
  if (typeof target === 'string') return target.toLowerCase();
  return '';
}

/**
 * Bước 7 — map lỗi raw-constraint Prisma → envelope (docs/06 §7.4). CHỈ lưới an toàn cho đua-điều-kiện;
 * mọi code ∈ registry §7.3 (KHÔNG đẻ code mới). Trả `null` ⇒ không nhận diện → caller dựng 500.
 *   - P2002 (unique): phân biệt qua `meta.target` — email / tên-nhóm / partial-unique leader; lạ → null.
 *   - P2003 (FK Restrict): luồng hard-delete DUY NHẤT là `DELETE /teams` (User.teamId Restrict) → 409.
 *   - P2025 (record-not-found): update/delete trên row đã biến mất → 404 (giấu tồn tại như keystone).
 */
function mapPrismaError(
  e: Prisma.PrismaClientKnownRequestError,
): { status: number; code: string; message: string } | null {
  switch (e.code) {
    case 'P2002': {
      const target = normalizeTarget(e.meta?.target);
      if (target.includes('email'))
        return {
          status: HttpStatus.CONFLICT,
          code: 'EMAIL_TAKEN',
          message: 'Email đã được sử dụng.',
        };
      if (target.includes('leader'))
        return {
          status: HttpStatus.CONFLICT,
          code: 'LEADER_ALREADY_EXISTS',
          message: 'Nhóm đã có leader.',
        };
      if (target.includes('name'))
        return {
          status: HttpStatus.CONFLICT,
          code: 'TEAM_NAME_TAKEN',
          message: 'Tên nhóm đã tồn tại.',
        };
      return null; // target không phân biệt được → 500 (đừng bịa code 409 chung)
    }
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: 'TEAM_NOT_EMPTY',
        message: 'Nhóm vẫn còn thành viên.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy tài nguyên.',
      };
    default:
      return null;
  }
}
