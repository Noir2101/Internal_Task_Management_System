import { Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ListTasksQuery,
  ListTasksResult,
  TaskQueryPort,
} from '../application/ports/task-query.port';
import { Task } from '../domain/task.entity';
import { EmailNotifier } from './email-notifier';

/**
 * Unit EmailNotifier — mock Transporter + PrismaService + TaskQueryPort. KHÔNG chạm mạng, KHÔNG DB.
 * Kiểm ba điều: (1) resolve recipient ĐÚNG (event mang ID → adapter tra email qua Prisma);
 * (2) BẤT BIẾN "email không vỡ task-write" — transporter throw thì notify* VẪN resolve (không reject);
 * (3) GĐ11 slice 2: digest quét qua PORT chứ không qua repository, và `rethrow` bật thì lỗi nổi lên
 *     được cho BullMQ retry.
 */
describe('EmailNotifier', () => {
  const FROM = 'ITMS <onboarding@resend.dev>';

  /** Fake Prisma: user theo id, leader qua findFirst, task cố định. */
  const makePrisma = () => {
    const usersById: Record<string, { email?: string; name: string } | null> = {
      assignee1: { email: 'assignee@x.local', name: 'Assignee' },
      owner1: { name: 'Owner' },
      member1: { name: 'Member' },
    };
    return {
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(usersById[where.id] ?? null),
        ),
        findFirst: jest.fn(() =>
          Promise.resolve({ email: 'leader@x.local', name: 'Leader' }),
        ),
      },
      task: {
        findUnique: jest.fn(() =>
          Promise.resolve({ title: 'Task X', deadline: null }),
        ),
      },
    } as unknown as PrismaService;
  };

  const makeTask = (id: string, title: string): Task =>
    new Task({
      id,
      title,
      description: null,
      progress: 'TODO',
      deadline: new Date('2026-01-01T00:00:00.000Z'),
      owner: { id: 'owner1', name: 'Owner' },
      assignee: { id: 'assignee1', name: 'Assignee' },
      assigneeTeamId: 'team1',
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      updatedAt: new Date('2025-12-01T00:00:00.000Z'),
    });

  /** Fake port đọc — chỉ `list` được dùng bởi digest; ba method kia không nằm trên đường này. */
  const makeQuery = (result: ListTasksResult) => {
    const seen: ListTasksQuery[] = [];
    const list = jest.fn((q: ListTasksQuery) => {
      seen.push(q);
      return Promise.resolve(result);
    });
    return { port: { list } as unknown as TaskQueryPort, seen };
  };

  const emptyQuery = () => makeQuery({ items: [], total: 0 }).port;

  const makeTransport = (sendMail: jest.Mock) =>
    ({ sendMail }) as unknown as Transporter;

  /** Bắt thư đã gửi ở dạng CÓ KIỂU, để assert không phải đi qua `any` của `mock.calls`. */
  const makeCapturingTransport = () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const sendMail = jest.fn(
      (mail: { to: string; subject: string; text: string }) => {
        sent.push(mail);
        return Promise.resolve();
      },
    );
    return { transporter: makeTransport(sendMail), sent };
  };

  describe('resolve recipient đúng', () => {
    it('notifyAssigned → gửi tới email của assignee', async () => {
      const sendMail = jest.fn().mockResolvedValue(undefined);
      const notifier = new EmailNotifier(
        makePrisma(),
        emptyQuery(),
        makeTransport(sendMail),
        FROM,
      );

      await notifier.notifyAssigned({
        taskId: 't1',
        assigneeId: 'assignee1',
        ownerId: 'owner1',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'assignee@x.local', from: FROM }),
      );
    });

    it('notifyReassigned → gửi tới assignee mới', async () => {
      const sendMail = jest.fn().mockResolvedValue(undefined);
      const notifier = new EmailNotifier(
        makePrisma(),
        emptyQuery(),
        makeTransport(sendMail),
        FROM,
      );

      await notifier.notifyReassigned({
        taskId: 't1',
        previousAssigneeId: 'owner1',
        newAssigneeId: 'assignee1',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'assignee@x.local' }),
      );
    });

    it('notifyTasksOrphaned → gửi tới leader nhóm', async () => {
      const sendMail = jest.fn().mockResolvedValue(undefined);
      const notifier = new EmailNotifier(
        makePrisma(),
        emptyQuery(),
        makeTransport(sendMail),
        FROM,
      );

      await notifier.notifyTasksOrphaned({
        deactivatedUserId: 'member1',
        teamId: 'team1',
        orphanedTaskCount: 3,
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'leader@x.local' }),
      );
    });
  });

  describe('bất biến: transporter throw → notify* KHÔNG reject', () => {
    let errSpy: jest.SpyInstance;
    beforeAll(() => {
      errSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });
    afterAll(() => errSpy.mockRestore());

    const failing = () =>
      new EmailNotifier(
        makePrisma(),
        emptyQuery(),
        makeTransport(jest.fn().mockRejectedValue(new Error('SMTP down'))),
        FROM,
      );

    it('notifyAssigned vẫn resolve', async () => {
      await expect(
        failing().notifyAssigned({
          taskId: 't1',
          assigneeId: 'assignee1',
          ownerId: 'owner1',
        }),
      ).resolves.toBeUndefined();
    });

    it('notifyReassigned vẫn resolve', async () => {
      await expect(
        failing().notifyReassigned({
          taskId: 't1',
          previousAssigneeId: 'owner1',
          newAssigneeId: 'assignee1',
        }),
      ).resolves.toBeUndefined();
    });

    it('notifyTasksOrphaned vẫn resolve', async () => {
      await expect(
        failing().notifyTasksOrphaned({
          deactivatedUserId: 'member1',
          teamId: 'team1',
          orphanedTaskCount: 3,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyOverdueDigest (GĐ11 slice 2)', () => {
    const NOW = new Date('2026-03-01T00:00:00.000Z');

    it('quét qua TaskQueryPort với overdue=true và ĐÚNG mốc now nhận được', async () => {
      const query = makeQuery({
        items: [makeTask('t1', 'Task quá hạn')],
        total: 1,
      });

      await new EmailNotifier(
        makePrisma(),
        query.port,
        makeCapturingTransport().transporter,
        FROM,
      ).notifyOverdueDigest({ teamId: 'team1', now: NOW });

      // Đi qua port, KHÔNG qua repository: `overduePredicate` vẫn là hàm private ở adapter, và
      // `list({ overdue: true })` là đường duy nhất dùng chung nó với cờ overdue của GET /tasks.
      expect(query.seen).toHaveLength(1);
      expect(query.seen[0].scopeTeamId).toBe('team1');
      expect(query.seen[0].overdue).toBe(true);
      expect(query.seen[0].now).toBe(NOW);
    });

    it('gửi tới leader của nhóm, kèm tổng số trong tiêu đề', async () => {
      const query = makeQuery({
        items: [makeTask('t1', 'Task quá hạn')],
        total: 7,
      });
      const mail = makeCapturingTransport();

      await new EmailNotifier(
        makePrisma(),
        query.port,
        mail.transporter,
        FROM,
      ).notifyOverdueDigest({ teamId: 'team1', now: NOW });

      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe('leader@x.local');
      expect(mail.sent[0].subject).toContain('7');
      // total lớn hơn số dòng liệt kê ⇒ phần dư gộp một dòng, không cắt cụt im lặng.
      expect(mail.sent[0].text).toContain('6 task khác');
    });

    it('nhóm sạch nợ (total = 0) → KHÔNG gửi thư rỗng', async () => {
      const sendMail = jest.fn().mockResolvedValue(undefined);

      await new EmailNotifier(
        makePrisma(),
        makeQuery({ items: [], total: 0 }).port,
        makeTransport(sendMail),
        FROM,
      ).notifyOverdueDigest({ teamId: 'team1', now: NOW });

      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('cờ rethrow — đường worker phải để lỗi nổi lên cho BullMQ', () => {
    let errSpy: jest.SpyInstance;
    beforeAll(() => {
      errSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });
    afterAll(() => errSpy.mockRestore());

    const withRethrow = (rethrow: boolean) =>
      new EmailNotifier(
        makePrisma(),
        emptyQuery(),
        makeTransport(jest.fn().mockRejectedValue(new Error('SMTP down'))),
        FROM,
        { rethrow },
      );

    const event = { taskId: 't1', assigneeId: 'assignee1', ownerId: 'owner1' };

    it('rethrow=false (mặc định, đường use-case) → nuốt lỗi', async () => {
      await expect(
        withRethrow(false).notifyAssigned(event),
      ).resolves.toBeUndefined();
    });

    it('rethrow=true (đường worker) → ném để job đếm attempt và retry', async () => {
      await expect(withRethrow(true).notifyAssigned(event)).rejects.toThrow(
        'SMTP down',
      );
    });
  });
});
