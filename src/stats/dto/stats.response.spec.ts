import 'reflect-metadata';
import { toStatsResponse } from './stats.response';

describe('toStatsResponse — cổng 2 default-deny + 3 bất biến OVERDUE (docs/06 §5)', () => {
  // Nguồn cố tình kèm: bucket OVERDUE lạ trong byProgress, field cấm trên assignee lồng, field thừa.
  const res = toStatsResponse({
    scope: { teamId: 'teamBE', teamName: 'Backend', secret: 'X' },
    total: 6,
    byProgress: { TODO: 3, IN_PROGRESS: 2, DONE: 1, OVERDUE: 99 },
    overdue: 2,
    byAssignee: [
      {
        assignee: {
          id: 'a1',
          name: 'An',
          passwordHash: 'H',
          email: 'a@y.z',
          teamId: 'teamBE',
        },
        byProgress: { TODO: 2, IN_PROGRESS: 1, DONE: 1, OVERDUE: 7 },
        overdue: 1,
        secretRollup: 'X',
      },
    ],
    passwordHash: 'H',
  });

  it('giữ đúng hình dạng hợp đồng (scope/total/overdue/byAssignee)', () => {
    expect(res.scope).toEqual({ teamId: 'teamBE', teamName: 'Backend' });
    expect(res.total).toBe(6);
    expect(res.overdue).toBe(2);
    expect(res.byAssignee[0].assignee).toEqual({ id: 'a1', name: 'An' });
    expect(res.byAssignee[0].overdue).toBe(1);
  });

  it('byProgress ĐÚNG 3 key — KHÔNG bucket OVERDUE thứ tư (bất biến #1)', () => {
    expect(Object.keys(res.byProgress).sort()).toEqual([
      'DONE',
      'IN_PROGRESS',
      'TODO',
    ]);
    expect((res.byProgress as Record<string, unknown>).OVERDUE).toBeUndefined();
    // byProgress per-assignee cũng đúng 3 key (bucket lạ bị loại ở nested projection).
    expect(Object.keys(res.byAssignee[0].byProgress).sort()).toEqual([
      'DONE',
      'IN_PROGRESS',
      'TODO',
    ]);
  });

  it('KHÔNG lộ field cấm/thừa (top-level, scope, assignee lồng, rollup)', () => {
    const r = res as Record<string, unknown>;
    expect(r.passwordHash).toBeUndefined();
    expect((res.scope as Record<string, unknown>).secret).toBeUndefined();
    const assignee = res.byAssignee[0].assignee as Record<string, unknown>;
    expect(assignee.passwordHash).toBeUndefined();
    expect(assignee.email).toBeUndefined();
    expect(assignee.teamId).toBeUndefined();
    expect(
      (res.byAssignee[0] as Record<string, unknown>).secretRollup,
    ).toBeUndefined();
  });
});
