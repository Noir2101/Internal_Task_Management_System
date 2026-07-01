import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { REFRESH_COOKIE_NAME } from '../../src/auth/refresh-cookie';
import { PREFIX } from './test-app';

export interface LoginResult {
  accessToken: string;
  /** Chuỗi cookie `refresh_token=<value>` để replay ở /auth/refresh, /auth/logout. */
  cookie: string;
  user: { id: string; name: string; role: string; teamId: string | null };
}

/** Header Authorization Bearer cho supertest `.set('Authorization', authHeader(token))`. */
export const authHeader = (token: string): string => `Bearer ${token}`;

/** Login thật (đi qua nguyên stack auth) → access token + refresh cookie + hồ sơ user. */
export async function loginAs(
  app: NestExpressApplication,
  email: string,
  password = 'Password123!',
): Promise<LoginResult> {
  const res = await request(app.getHttpServer())
    .post(`${PREFIX}/auth/login`)
    .send({ email, password })
    .expect(200);
  return {
    accessToken: res.body.accessToken as string,
    cookie: extractRefreshCookie(res.headers['set-cookie']),
    user: res.body.user as LoginResult['user'],
  };
}

/** Lấy `name=value` của refresh cookie từ header Set-Cookie (bỏ attributes). */
export function extractRefreshCookie(
  setCookie: string[] | string | undefined,
): string {
  const arr = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const raw = arr.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!raw) throw new Error('Set-Cookie không có refresh_token');
  return raw.split(';')[0];
}
