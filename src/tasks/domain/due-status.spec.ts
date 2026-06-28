import { DueStatus } from './due-status';
import { Progress } from './task.entity';

/** Clock cố định — overdue không phụ thuộc giờ máy (cổng 3). */
const NOW = new Date('2026-06-29T00:00:00.000Z');
const PAST = new Date('2026-06-28T00:00:00.000Z');
const FUTURE = new Date('2026-06-30T00:00:00.000Z');

const task = (deadline: Date | null, progress: Progress) => ({
  deadline,
  progress,
});

describe('DueStatus.isOverdue — OVERDUE computed (docs/06 §4)', () => {
  it('quá hạn + chưa DONE ⇒ overdue', () => {
    expect(DueStatus.isOverdue(task(PAST, 'IN_PROGRESS'), NOW)).toBe(true);
    expect(DueStatus.isOverdue(task(PAST, 'TODO'), NOW)).toBe(true);
  });

  it('DONE-quá-hạn ⇒ KHÔNG overdue (đã xong không tính trễ)', () => {
    expect(DueStatus.isOverdue(task(PAST, 'DONE'), NOW)).toBe(false);
  });

  it('deadline NULL ⇒ KHÔNG bao giờ overdue', () => {
    expect(DueStatus.isOverdue(task(null, 'IN_PROGRESS'), NOW)).toBe(false);
    expect(DueStatus.isOverdue(task(null, 'TODO'), NOW)).toBe(false);
  });

  it('deadline tương lai ⇒ KHÔNG overdue', () => {
    expect(DueStatus.isOverdue(task(FUTURE, 'IN_PROGRESS'), NOW)).toBe(false);
  });

  it('deadline ĐÚNG bằng now ⇒ KHÔNG overdue (strict <)', () => {
    expect(DueStatus.isOverdue(task(NOW, 'TODO'), NOW)).toBe(false);
  });
});
