import { Logger } from '@nestjs/common';
import type { Clock } from '../../../common/clock';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  Notifier,
  OverdueDigestEvent,
} from '../../application/ports/notifier.port';
import { OverdueDigestSweep } from './overdue-digest.sweep';

/**
 * Unit lượt quét digest — fake Prisma + Clock cố định, KHÔNG DB, KHÔNG Redis.
 *
 * Bất biến chính là CỔNG 3: một lượt quét chốt MỘT mốc `now` rồi phát cho mọi nhóm. Nếu ai đó dời
 * `clock.now()` vào trong vòng lặp thì các nhóm quét theo những mốc lệch nhau và ranh giới OVERDUE
 * trong cùng một bản digest không còn nhất quán — test này bắt đúng nước đi đó.
 */
describe('OverdueDigestSweep', () => {
  const FIXED = new Date('2026-03-01T00:00:00.000Z');
  const clock: Clock = { now: () => new Date(FIXED) };

  const makePrisma = (teamIds: string[]) => {
    const findMany = jest.fn(() =>
      Promise.resolve(teamIds.map((id) => ({ id }))),
    );
    return {
      prisma: { team: { findMany } } as unknown as PrismaService,
      findMany,
    };
  };

  class SpyNotifier implements Notifier {
    digests: OverdueDigestEvent[] = [];
    notifyAssigned(): Promise<void> {
      return Promise.resolve();
    }
    notifyReassigned(): Promise<void> {
      return Promise.resolve();
    }
    notifyTasksOrphaned(): Promise<void> {
      return Promise.resolve();
    }
    notifyOverdueDigest(event: OverdueDigestEvent): Promise<void> {
      this.digests.push(event);
      return Promise.resolve();
    }
  }

  let logSpy: jest.SpyInstance;
  beforeAll(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });
  afterAll(() => logSpy.mockRestore());

  it('phát một digest cho mỗi nhóm có leader đang hoạt động', async () => {
    const notifier = new SpyNotifier();
    const sweep = new OverdueDigestSweep(
      makePrisma(['team1', 'team2']).prisma,
      notifier,
      clock,
    );

    await expect(sweep.run()).resolves.toBe(2);
    expect(notifier.digests.map((d) => d.teamId)).toEqual(['team1', 'team2']);
  });

  it('mọi nhóm nhận CÙNG một mốc now (cổng 3)', async () => {
    const notifier = new SpyNotifier();
    const sweep = new OverdueDigestSweep(
      makePrisma(['team1', 'team2', 'team3']).prisma,
      notifier,
      clock,
    );

    await sweep.run();

    const stamps = new Set(notifier.digests.map((d) => d.now.toISOString()));
    expect(stamps).toEqual(new Set([FIXED.toISOString()]));
  });

  it('chỉ xét nhóm có leader đang hoạt động — không có người nhận thì quét vô nghĩa', async () => {
    const { prisma, findMany } = makePrisma([]);
    const sweep = new OverdueDigestSweep(prisma, new SpyNotifier(), clock);

    await sweep.run();

    expect(findMany).toHaveBeenCalledWith({
      where: { members: { some: { role: 'LEADER', isActive: true } } },
      select: { id: true },
    });
  });

  it('không nhóm nào thì không phát gì', async () => {
    const notifier = new SpyNotifier();
    const sweep = new OverdueDigestSweep(
      makePrisma([]).prisma,
      notifier,
      clock,
    );

    await expect(sweep.run()).resolves.toBe(0);
    expect(notifier.digests).toHaveLength(0);
  });
});
