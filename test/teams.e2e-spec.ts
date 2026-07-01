import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeedHandles } from '../prisma/seed';
import { authHeader, loginAs } from './setup/auth';
import { resetAndSeed } from './setup/fixture';
import { buildTestApp, PREFIX } from './setup/test-app';

/**
 * e2e Teams (docs/06 §9.3/§9.4, FR-USER-02). Admin cho CRUD/leader-swap/break-glass; member cho roster.
 * Assert `code` + status, KHÔNG assert `message`. Phủ: leader-swap atomic (≤1 leader), LEADER_NOT_TEAM_MEMBER,
 * TEAM_NAME_TAKEN (P2002 thật), break-glass DELETE (rỗng→204 / còn user→409 + dòng log BreakGlass), roster brief + scope.
 */
describe('Teams (e2e)', () => {
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
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
  ): request.Test =>
    request(app.getHttpServer())
      [method](`${PREFIX}${path}`)
      .set('Authorization', authHeader(adminToken));

  describe('PUT /teams/:id/leader (swap atomic)', () => {
    it('promote member → 200; leader cũ về MEMBER; đúng ≤1 leader', async () => {
      await asAdmin('put', `/teams/${h.teams.backend.id}/leader`)
        .send({ userId: h.users.beA.id })
        .expect(200);

      const oldLead = await prisma.user.findUnique({
        where: { id: h.users.beLead.id },
      });
      const newLead = await prisma.user.findUnique({
        where: { id: h.users.beA.id },
      });
      expect(oldLead!.role).toBe(Role.MEMBER);
      expect(newLead!.role).toBe(Role.LEADER);

      const leaderCount = await prisma.user.count({
        where: { teamId: h.teams.backend.id, role: Role.LEADER },
      });
      expect(leaderCount).toBe(1);
    });

    it('promote người ngoài nhóm → 400 LEADER_NOT_TEAM_MEMBER', async () => {
      const res = await asAdmin('put', `/teams/${h.teams.backend.id}/leader`)
        .send({ userId: h.users.feA.id }) // thuộc Frontend
        .expect(400);
      expect(res.body.code).toBe('LEADER_NOT_TEAM_MEMBER');
    });
  });

  describe('POST /teams (Prisma-error)', () => {
    it('tên nhóm trùng → 409 TEAM_NAME_TAKEN', async () => {
      const res = await asAdmin('post', '/teams')
        .send({ name: 'Backend' }) // đã tồn tại trong seed
        .expect(409);
      expect(res.body.code).toBe('TEAM_NAME_TAKEN');
    });
  });

  describe('DELETE /teams/:id (break-glass)', () => {
    it('nhóm rỗng (chưa từng có member) → 204', async () => {
      const created = await asAdmin('post', '/teams')
        .send({ name: 'Empty Team' })
        .expect(201);
      await asAdmin('delete', `/teams/${created.body.id}`).expect(204);
    });

    it('nhóm còn member → 409 TEAM_NOT_EMPTY + ghi một dòng log BreakGlass', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        const res = await asAdmin(
          'delete',
          `/teams/${h.teams.backend.id}`,
        ).expect(409);
        expect(res.body.code).toBe('TEAM_NOT_EMPTY');

        const logged = warnSpy.mock.calls.some(
          (c) => typeof c[0] === 'string' && c[0].includes('DELETE_TEAM'),
        );
        expect(logged).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('GET /teams/:id/members (roster)', () => {
    it('member xem nhóm mình → 200 brief [{id,name}]', async () => {
      const { accessToken } = await loginAs(app, 'be.a@demo.local');
      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/teams/${h.teams.backend.id}/members`)
        .set('Authorization', authHeader(accessToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      for (const m of res.body) {
        expect(Object.keys(m).sort()).toEqual(['id', 'name']);
        expect(m.email).toBeUndefined();
        expect(m.role).toBeUndefined();
        expect(m.isActive).toBeUndefined();
      }
    });

    it('member xem nhóm khác → 404 RESOURCE_NOT_FOUND', async () => {
      const { accessToken } = await loginAs(app, 'be.a@demo.local');
      const res = await request(app.getHttpServer())
        .get(`${PREFIX}/teams/${h.teams.frontend.id}/members`)
        .set('Authorization', authHeader(accessToken))
        .expect(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
