import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeedHandles } from '../prisma/seed';
import { authHeader, loginAs } from './setup/auth';
import { resetAndSeed } from './setup/fixture';
import { buildTestApp, PREFIX } from './setup/test-app';

/**
 * e2e Users (docs/06 §9, FR-USER-01/02). Admin-only. Assert `code` + status, KHÔNG assert `message`.
 * Phủ: deactivate/reactivate, orphanedTaskCount loại DONE+soft-deleted, LEADER_REPLACEMENT_REQUIRED,
 * CANNOT_DISABLE_SELF, CHECK admin↔team, EMAIL_TAKEN (P2002 thật), LEADER_ALREADY_EXISTS,
 * mass-assignment PATCH role, hide→404 cho non-admin, meta phân trang.
 */
describe('Users (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let h: SeedHandles;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    h = await resetAndSeed(prisma);
    ({ accessToken: adminToken } = await loginAs(app, 'admin@demo.local'));
  });

  const asAdmin = (
    method: 'get' | 'post' | 'patch',
    path: string,
  ): request.Test =>
    request(app.getHttpServer())
      [method](`${PREFIX}${path}`)
      .set('Authorization', authHeader(adminToken));

  describe('deactivate / reactivate', () => {
    it('vô hiệu hoá member → 200 {isActive:false, orphanedTaskCount:2} (loại DONE + soft-deleted)', async () => {
      const res = await asAdmin(
        'post',
        `/users/${h.users.beB.id}/deactivate`,
      ).expect(200);
      expect(res.body.user.isActive).toBe(false);
      expect(res.body.orphanedTaskCount).toBe(2);
    });

    it('kích hoạt lại → 200 {isActive:true}', async () => {
      await asAdmin('post', `/users/${h.users.beB.id}/deactivate`).expect(200);
      const res = await asAdmin(
        'post',
        `/users/${h.users.beB.id}/reactivate`,
      ).expect(200);
      expect(res.body.user.isActive).toBe(true);
    });

    it('vô hiệu hoá leader chưa có người thay → 409 LEADER_REPLACEMENT_REQUIRED', async () => {
      const res = await asAdmin(
        'post',
        `/users/${h.users.beLead.id}/deactivate`,
      ).expect(409);
      expect(res.body.code).toBe('LEADER_REPLACEMENT_REQUIRED');
    });

    it('admin vô hiệu hoá chính mình → 409 CANNOT_DISABLE_SELF', async () => {
      const res = await asAdmin(
        'post',
        `/users/${h.admin.id}/deactivate`,
      ).expect(409);
      expect(res.body.code).toBe('CANNOT_DISABLE_SELF');
    });
  });

  describe('POST /users (CHECK admin↔team + Prisma-error)', () => {
    it('role=ADMIN kèm teamId → 400 VALIDATION_FAILED', async () => {
      const res = await asAdmin('post', '/users')
        .send({
          email: 'new.admin@demo.local',
          name: 'X',
          password: 'Password123!',
          role: 'ADMIN',
          teamId: h.teams.backend.id,
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('role=MEMBER thiếu teamId → 400 VALIDATION_FAILED', async () => {
      const res = await asAdmin('post', '/users')
        .send({
          email: 'new.member@demo.local',
          name: 'X',
          password: 'Password123!',
          role: 'MEMBER',
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('email trùng → 409 EMAIL_TAKEN', async () => {
      const res = await asAdmin('post', '/users')
        .send({
          email: 'be.a@demo.local', // đã tồn tại trong seed
          name: 'Trùng',
          password: 'Password123!',
          role: 'MEMBER',
          teamId: h.teams.backend.id,
        })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('tạo LEADER cho nhóm đã có leader → 409 LEADER_ALREADY_EXISTS', async () => {
      const res = await asAdmin('post', '/users')
        .send({
          email: 'second.lead@demo.local',
          name: 'Leader 2',
          password: 'Password123!',
          role: 'LEADER',
          teamId: h.teams.backend.id, // đã có beLead
        })
        .expect(409);
      expect(res.body.code).toBe('LEADER_ALREADY_EXISTS');
    });
  });

  describe('PATCH /users/:id (chống mass-assignment)', () => {
    it('body có role/teamId → 400 VALIDATION_FAILED (forbidNonWhitelisted)', async () => {
      const res = await asAdmin('patch', `/users/${h.users.beA.id}`)
        .send({ name: 'Tên mới', role: 'ADMIN' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('authz + list', () => {
    it('non-admin (leader token) gọi /users → 404 RESOURCE_NOT_FOUND (hide)', async () => {
      const { accessToken: leaderToken } = await loginAs(
        app,
        'be.lead@demo.local',
      );
      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/users`)
        .set('Authorization', authHeader(leaderToken))
        .expect(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('GET /users → meta {page,limit,total,totalPages}; mặc định loại inactive', async () => {
      await prisma.user.update({
        where: { id: h.users.beA.id },
        data: { isActive: false },
      });

      const res = await asAdmin('get', '/users').expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('totalPages');
      const ids: string[] = res.body.data.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(h.users.beA.id); // inactive bị loại mặc định

      const withInactive = await asAdmin(
        'get',
        '/users?includeInactive=true',
      ).expect(200);
      const ids2: string[] = withInactive.body.data.map(
        (u: { id: string }) => u.id,
      );
      expect(ids2).toContain(h.users.beA.id);
    });
  });
});
