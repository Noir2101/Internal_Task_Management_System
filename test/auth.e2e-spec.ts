import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { REFRESH_COOKIE_NAME } from '../src/auth/refresh-cookie';
import { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, extractRefreshCookie, loginAs } from './setup/auth';
import { resetAndSeed } from './setup/fixture';
import { buildTestApp, PREFIX } from './setup/test-app';

/**
 * e2e Auth (docs/06 §6, FR-AUTH-02..04). Assert `code` + status, KHÔNG assert `message`.
 * Login password-first (chống dò email); rotation + reuse-detection; logout revoke.
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const LEADER = 'huy.hoangkhang21@gmail.com';

  beforeAll(async () => {
    ({ app, prisma } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  const http = () => request(app.getHttpServer());

  describe('POST /auth/login', () => {
    it('đúng email+mật khẩu (active) → 200 + accessToken + user projection + refresh cookie', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ email: LEADER, password: 'Password123!' })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({ role: 'LEADER' });
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('teamId');
      expect(res.body.user.passwordHash).toBeUndefined();

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      const cookie = setCookie.find((c) =>
        c.startsWith(`${REFRESH_COOKIE_NAME}=`),
      );
      expect(cookie).toBeDefined();
      expect(cookie!.toLowerCase()).toContain('httponly');
    });

    it('sai mật khẩu → 401 INVALID_CREDENTIALS', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ email: LEADER, password: 'wrong-password' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('email lạ → 401 INVALID_CREDENTIALS (không lộ email tồn tại)', async () => {
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'ghost@demo.local', password: 'Password123!' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('tài khoản bị vô hiệu hoá (pass đúng) → 403 ACCOUNT_DISABLED', async () => {
      await prisma.user.update({
        where: { email: 'be.a@demo.local' },
        data: { isActive: false },
      });
      const res = await http()
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'be.a@demo.local', password: 'Password123!' })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotation → 200 + accessToken + cookie MỚI', async () => {
      const { cookie } = await loginAs(app, LEADER);
      const res = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookie)
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      const rotated = extractRefreshCookie(res.headers['set-cookie']);
      expect(rotated).not.toBe(cookie); // token thô đổi mỗi lần rotate
    });

    it('thiếu cookie → 401 SESSION_EXPIRED', async () => {
      const res = await http().post(`${PREFIX}/auth/refresh`).expect(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('reuse-detection: trình lại cookie đã rotate → 401 SESSION_EXPIRED, cả token con cũng bị thu hồi', async () => {
      const { cookie: c1 } = await loginAs(app, LEADER);
      // rotate lần 1 → c2
      const rotate = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', c1)
        .expect(200);
      const c2 = extractRefreshCookie(rotate.headers['set-cookie']);

      // trình lại c1 (đã dùng) → reuse → 401 + revoke cả family
      const reuse = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', c1)
        .expect(401);
      expect(reuse.body.code).toBe('SESSION_EXPIRED');

      // c2 (con hợp lệ) giờ cũng chết vì family bị revoke
      const child = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', c2)
        .expect(401);
      expect(child.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('POST /auth/logout', () => {
    it('→ 204, cookie sau đó không refresh được nữa', async () => {
      const { cookie } = await loginAs(app, LEADER);
      await http()
        .post(`${PREFIX}/auth/logout`)
        .set('Cookie', cookie)
        .expect(204);

      const after = await http()
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', cookie)
        .expect(401);
      expect(after.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('GET /auth/me', () => {
    it('Bearer hợp lệ → 200 + user projection', async () => {
      const { accessToken } = await loginAs(app, LEADER);
      const res = await http()
        .get(`${PREFIX}/auth/me`)
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(res.body.user).toMatchObject({ role: 'LEADER' });
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('thiếu token → 401 TOKEN_INVALID', async () => {
      const res = await http().get(`${PREFIX}/auth/me`).expect(401);
      expect(res.body.code).toBe('TOKEN_INVALID');
    });
  });
});
