import { createId } from '@paralleldrive/cuid2';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Sinh/propagate requestId cho mỗi request. Honor `X-Request-Id` đến (nếu có),
 * còn lại tạo `req_<cuid2>`. Gắn lên `req.requestId` (envelope lỗi đọc) và echo header.
 * Áp global bằng `app.use()` ở main.ts để chạy cho mọi route, kể cả 404.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : `req_${createId()}`;

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
