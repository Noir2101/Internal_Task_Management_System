import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeedHandles } from '../prisma/seed';
import { authHeader, loginAs } from './setup/auth';
import { resetAndSeed } from './setup/fixture';
import { buildTestApp, PREFIX } from './setup/test-app';

/**
 * e2e Tasks ngoài keystone (docs/06 §3/§4, FR-TASK-01..05). Assert `code` + status, KHÔNG assert `message`.
 * Phủ: pagination + trần 100, sort tất định, overdue×progress cùng `now`, search ILIKE title+description,
 * IDOR→404, one-law-per-endpoint (owner/assignee/leader). Tasks KHÔNG có `@Roles` ở rìa — mọi authz
 * record-level SAU scoped-load ⇒ deny code cụ thể (NOT_TASK_OWNER, NOT_TASK_ASSIGNEE, TASK_MEMBER_SELF_ASSIGN_ONLY).
 */
describe('Tasks (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let h: SeedHandles;
  let leaderBE: string;
  let memberA: string; // beA
  let memberB: string; // beB

  beforeAll(async () => {
    ({ app, prisma } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    h = await resetAndSeed(prisma);
    [leaderBE, memberA, memberB] = await Promise.all([
      loginAs(app, 'huy.hoangkhang21@gmail.com').then((r) => r.accessToken),
      loginAs(app, 'be.a@demo.local').then((r) => r.accessToken),
      loginAs(app, 'be.b@demo.local').then((r) => r.accessToken),
    ]);
  });

  const as = (
    token: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ): request.Test =>
    request(app.getHttpServer())
      [method](`${PREFIX}${path}`)
      .set('Authorization', authHeader(token));

  describe('GET /tasks — pagination + sort', () => {
    it('mặc định: 6 task trong scope BE, meta {page:1,limit:20,total:6,totalPages:1}', async () => {
      const res = await as(leaderBE, 'get', '/tasks').expect(200);
      expect(res.body.data).toHaveLength(6);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 6,
        totalPages: 1,
      });
    });

    it('phân trang: limit=2&page=1 → data 2, totalPages 3', async () => {
      const res = await as(leaderBE, 'get', '/tasks?limit=2&page=1').expect(
        200,
      );
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 6,
        totalPages: 3,
      });
    });

    it('limit vượt trần 100 → 400 VALIDATION_FAILED', async () => {
      const res = await as(leaderBE, 'get', '/tasks?limit=200').expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('sort tất định createdAt DESC, id DESC', async () => {
      const res = await as(leaderBE, 'get', '/tasks').expect(200);
      const data: { id: string; createdAt: string }[] = res.body.data;
      const sorted = [...data].sort((a, b) => {
        const dt =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (dt !== 0) return dt;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC
      });
      expect(data.map((t) => t.id)).toEqual(sorted.map((t) => t.id));
    });
  });

  describe('GET /tasks — overdue × progress cùng một now', () => {
    it('?overdue=true → đúng 2 task quá hạn (cờ overdue:true); DONE-quá-hạn bị loại', async () => {
      const res = await as(leaderBE, 'get', '/tasks?overdue=true').expect(200);
      const titles: string[] = res.body.data.map(
        (t: { title: string }) => t.title,
      );
      expect(titles.sort()).toEqual(['Fix bug 500', 'Migration prod']);
      expect(
        res.body.data.every((t: { overdue: boolean }) => t.overdue === true),
      ).toBe(true);
    });

    it('?overdue=true&progress=IN_PROGRESS → chỉ Migration prod', async () => {
      const res = await as(
        leaderBE,
        'get',
        '/tasks?overdue=true&progress=IN_PROGRESS',
      ).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Migration prod');
      expect(res.body.data[0].overdue).toBe(true);
    });

    it('?overdue=false loại 2 task quá hạn nhưng GIỮ DONE-quá-hạn (Thiết kế schema không overdue)', async () => {
      const res = await as(leaderBE, 'get', '/tasks?overdue=false').expect(200);
      const titles: string[] = res.body.data.map(
        (t: { title: string }) => t.title,
      );
      expect(titles).not.toContain('Migration prod');
      expect(titles).not.toContain('Fix bug 500');
      expect(titles).toContain('Thiết kế schema'); // DONE + quá hạn ⇒ KHÔNG overdue
    });
  });

  describe('GET /tasks — search ILIKE title + description', () => {
    it('?q khớp title (không phân biệt hoa thường)', async () => {
      const lower = await as(leaderBE, 'get', '/tasks?q=migration').expect(200);
      expect(lower.body.data.map((t: { title: string }) => t.title)).toContain(
        'Migration prod',
      );
      const upper = await as(leaderBE, 'get', '/tasks?q=MIGRATION').expect(200);
      expect(upper.body.data.map((t: { title: string }) => t.title)).toContain(
        'Migration prod',
      );
    });

    it('?q khớp description', async () => {
      await as(leaderBE, 'post', '/tasks')
        .send({
          title: 'Task có mô tả',
          description: 'chuoi-dac-biet-trong-mo-ta',
          assigneeId: h.users.beA.id,
        })
        .expect(201);

      const res = await as(
        leaderBE,
        'get',
        '/tasks?q=chuoi-dac-biet-trong-mo-ta',
      ).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Task có mô tả');
    });
  });

  describe('IDOR', () => {
    it('BE leader GET task của FE → 404 RESOURCE_NOT_FOUND', async () => {
      const res = await as(
        leaderBE,
        'get',
        `/tasks/${h.tasks.feLayout.id}`,
      ).expect(404);
      expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('one-law-per-endpoint', () => {
    it('PATCH /:id (định nghĩa) — owner-only', async () => {
      const notOwner = await as(
        memberA,
        'patch',
        `/tasks/${h.tasks.designSchema.id}`,
      )
        .send({ title: 'Đổi trộm' })
        .expect(403);
      expect(notOwner.body.code).toBe('NOT_TASK_OWNER');

      const owner = await as(
        leaderBE,
        'patch',
        `/tasks/${h.tasks.designSchema.id}`,
      )
        .send({ title: 'Tên hợp lệ' })
        .expect(200);
      expect(owner.body.title).toBe('Tên hợp lệ');
    });

    it('PATCH /:id/progress — assignee-only', async () => {
      const notAssignee = await as(
        memberB,
        'patch',
        `/tasks/${h.tasks.writeAuth.id}/progress`,
      )
        .send({ progress: 'DONE' })
        .expect(403);
      expect(notAssignee.body.code).toBe('NOT_TASK_ASSIGNEE');

      const assignee = await as(
        memberA,
        'patch',
        `/tasks/${h.tasks.writeAuth.id}/progress`,
      )
        .send({ progress: 'DONE' })
        .expect(200);
      expect(assignee.body.progress).toBe('DONE');
    });

    it('PATCH /:id/assignee — leader-only (member → TASK_MEMBER_SELF_ASSIGN_ONLY)', async () => {
      const member = await as(
        memberA,
        'patch',
        `/tasks/${h.tasks.writeAuth.id}/assignee`,
      )
        .send({ assigneeId: h.users.beB.id })
        .expect(403);
      expect(member.body.code).toBe('TASK_MEMBER_SELF_ASSIGN_ONLY');

      const leader = await as(
        leaderBE,
        'patch',
        `/tasks/${h.tasks.writeAuth.id}/assignee`,
      )
        .send({ assigneeId: h.users.beB.id })
        .expect(200);
      expect(leader.body.assignee.id).toBe(h.users.beB.id);
    });

    it('DELETE /:id — owner-only; xoá xong GET → 404', async () => {
      const notOwner = await as(
        memberA,
        'delete',
        `/tasks/${h.tasks.writeAuth.id}`,
      ).expect(403);
      expect(notOwner.body.code).toBe('NOT_TASK_OWNER');

      await as(leaderBE, 'delete', `/tasks/${h.tasks.writeAuth.id}`).expect(
        204,
      );
      await as(leaderBE, 'get', `/tasks/${h.tasks.writeAuth.id}`).expect(404);
    });
  });
});
