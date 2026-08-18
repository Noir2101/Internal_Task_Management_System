import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { JOB, NOTIFICATION_JOB_OPTS } from './notification-queue.constants';
import { QueuedNotifier } from './queued-notifier';

/**
 * Unit QueuedNotifier — mock Queue, KHÔNG chạm Redis. Ba điều đáng khoá:
 *  (1) mỗi hook của port ra đúng một job đúng tên;
 *  (2) payload CHỈ mang ID và chuỗi ISO — không địa chỉ email nào rơi vào Redis (docs/07.A §3);
 *  (3) BẤT BIẾN "email không vỡ task-write": `queue.add` reject thì notify* VẪN resolve. Đây là
 *      chỗ dễ trượt nhất của slice 2 — trước kia adapter nuốt lỗi, giờ lớp bọc phải nuốt thay.
 */
describe('QueuedNotifier', () => {
  /** Bắt job đã ghi ở dạng CÓ KIỂU, để assert không phải đi qua `any` của `mock.calls`. */
  const makeQueue = () => {
    const jobs: { name: string; payload: Record<string, unknown> }[] = [];
    const add = jest.fn((name: string, payload: Record<string, unknown>) => {
      jobs.push({ name, payload });
      return Promise.resolve();
    });
    return { queue: { add } as unknown as Queue, jobs };
  };

  describe('mỗi hook ra một job đúng tên và đúng payload', () => {
    it('notifyAssigned', async () => {
      const q = makeQueue();
      await new QueuedNotifier(q.queue).notifyAssigned({
        taskId: 't1',
        assigneeId: 'u1',
        ownerId: 'u2',
      });

      expect(q.jobs).toEqual([
        {
          name: JOB.ASSIGNED,
          payload: { taskId: 't1', assigneeId: 'u1', ownerId: 'u2' },
        },
      ]);
    });

    it('notifyReassigned', async () => {
      const q = makeQueue();
      await new QueuedNotifier(q.queue).notifyReassigned({
        taskId: 't1',
        previousAssigneeId: 'u1',
        newAssigneeId: 'u2',
      });

      expect(q.jobs).toEqual([
        {
          name: JOB.REASSIGNED,
          payload: {
            taskId: 't1',
            previousAssigneeId: 'u1',
            newAssigneeId: 'u2',
          },
        },
      ]);
    });

    it('notifyTasksOrphaned', async () => {
      const q = makeQueue();
      await new QueuedNotifier(q.queue).notifyTasksOrphaned({
        deactivatedUserId: 'u1',
        teamId: 'team1',
        orphanedTaskCount: 3,
      });

      expect(q.jobs).toEqual([
        {
          name: JOB.ORPHANED,
          payload: {
            deactivatedUserId: 'u1',
            teamId: 'team1',
            orphanedTaskCount: 3,
          },
        },
      ]);
    });

    it('notifyOverdueDigest — Date thành chuỗi ISO để sống sót qua JSON', async () => {
      const q = makeQueue();
      await new QueuedNotifier(q.queue).notifyOverdueDigest({
        teamId: 'team1',
        now: new Date('2026-03-01T00:00:00.000Z'),
      });

      expect(q.jobs).toEqual([
        {
          name: JOB.OVERDUE_DIGEST,
          payload: { teamId: 'team1', nowIso: '2026-03-01T00:00:00.000Z' },
        },
      ]);
    });
  });

  it('job mang theo attempts + backoff — retry chỉ có nghĩa vì adapter worker chạy rethrow', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    await new QueuedNotifier({ add } as unknown as Queue).notifyAssigned({
      taskId: 't1',
      assigneeId: 'u1',
      ownerId: 'u2',
    });

    expect(add).toHaveBeenCalledWith(
      JOB.ASSIGNED,
      expect.anything(),
      NOTIFICATION_JOB_OPTS,
    );
  });

  it('payload không bao giờ chứa email — event mang ID, adapter mới tra người nhận', async () => {
    const q = makeQueue();
    const notifier = new QueuedNotifier(q.queue);

    await notifier.notifyAssigned({
      taskId: 't1',
      assigneeId: 'u1',
      ownerId: 'u2',
    });
    await notifier.notifyTasksOrphaned({
      deactivatedUserId: 'u1',
      teamId: 'team1',
      orphanedTaskCount: 1,
    });
    await notifier.notifyOverdueDigest({ teamId: 'team1', now: new Date() });

    for (const job of q.jobs) {
      expect(JSON.stringify(job.payload)).not.toContain('@');
    }
  });

  describe('bất biến: queue.add reject → notify* KHÔNG reject', () => {
    let errSpy: jest.SpyInstance;
    beforeAll(() => {
      errSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });
    afterAll(() => errSpy.mockRestore());

    const failing = () =>
      new QueuedNotifier({
        add: jest.fn().mockRejectedValue(new Error('Redis down')),
      } as unknown as Queue);

    it('notifyAssigned vẫn resolve', async () => {
      await expect(
        failing().notifyAssigned({
          taskId: 't1',
          assigneeId: 'u1',
          ownerId: 'u2',
        }),
      ).resolves.toBeUndefined();
    });

    it('notifyReassigned vẫn resolve', async () => {
      await expect(
        failing().notifyReassigned({
          taskId: 't1',
          previousAssigneeId: 'u1',
          newAssigneeId: 'u2',
        }),
      ).resolves.toBeUndefined();
    });

    it('notifyTasksOrphaned vẫn resolve', async () => {
      await expect(
        failing().notifyTasksOrphaned({
          deactivatedUserId: 'u1',
          teamId: 'team1',
          orphanedTaskCount: 3,
        }),
      ).resolves.toBeUndefined();
    });

    it('notifyOverdueDigest vẫn resolve', async () => {
      await expect(
        failing().notifyOverdueDigest({ teamId: 'team1', now: new Date() }),
      ).resolves.toBeUndefined();
    });
  });
});
