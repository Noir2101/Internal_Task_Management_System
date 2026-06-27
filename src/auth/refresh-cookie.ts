import { CookieOptions, Request, Response } from 'express';

/**
 * Refresh cookie (docs/06 §6.4): HttpOnly; Secure(prod); SameSite=Lax; Path=/api/v1/auth.
 * Path giới hạn → cookie KHÔNG gửi kèm /tasks, /users → call API nằm ngoài diện CSRF.
 * `Secure` gate theo NODE_ENV để dev qua http://localhost vẫn gửi được cookie.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

/** maxAge suy từ expiresAt (cùng nguồn TTL với expiresAt lưu DB) → cookie và DB không lệch. */
export function setRefreshCookie(
  res: Response,
  raw: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE_NAME, raw, {
    ...baseOptions(),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

/** Phải dùng CÙNG path/attrs mới xoá đúng cookie. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_COOKIE_NAME
  ];
}
