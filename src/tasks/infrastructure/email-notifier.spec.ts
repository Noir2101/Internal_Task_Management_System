import { Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailNotifier } from './email-notifier';

/**
 * Unit EmailNotifier — mock Transporter + PrismaService. KHÔNG chạm mạng, KHÔNG DB.
 * Kiểm hai điều: (1) resolve recipient ĐÚNG (event mang ID → adapter tra email qua Prisma);
 * (2) BẤT BIẾN "email không vỡ task-write" — transporter throw thì notify* VẪN resolve (không reject).
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

  const makeTransport = (sendMail: jest.Mock) =>
    ({ sendMail }) as unknown as Transporter;

  describe('resolve recipient đúng', () => {
    it('notifyAssigned → gửi tới email của assignee', async () => {
      const sendMail = jest.fn().mockResolvedValue(undefined);
      const notifier = new EmailNotifier(
        makePrisma(),
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
});
