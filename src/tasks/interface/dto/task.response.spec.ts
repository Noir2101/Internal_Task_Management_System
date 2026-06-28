import 'reflect-metadata';
import { toTaskResponse } from './task.response';

describe('toTaskResponse — cổng 2 default-deny cho Task (docs/06 §8.2)', () => {
  // Nguồn cố tình kèm field cấm + field thừa trên user lồng — không cái nào được lọt.
  const res = toTaskResponse({
    id: 'tk1',
    title: 'Migration prod',
    description: 'desc',
    progress: 'IN_PROGRESS',
    deadline: new Date('2026-06-22T17:00:00.000Z'),
    overdue: true,
    owner: { id: 'o1', name: 'Bích', passwordHash: 'H', email: 'x@y.z' },
    assignee: { id: 'a1', name: 'Bảo', teamId: 'teamA', passwordHash: 'H' },
    // field PHẢI bị loại:
    assigneeTeamId: 'teamA',
    ownerId: 'o1',
    assigneeId: 'a1',
    deletedAt: new Date(),
    teamId: 'teamA',
    passwordHash: 'H',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
  });

  it('giữ đúng field hợp đồng', () => {
    expect(res.id).toBe('tk1');
    expect(res.title).toBe('Migration prod');
    expect(res.progress).toBe('IN_PROGRESS');
    expect(res.overdue).toBe(true);
    expect(res.owner).toEqual({ id: 'o1', name: 'Bích' });
    expect(res.assignee).toEqual({ id: 'a1', name: 'Bảo' });
  });

  it('KHÔNG lộ field nội tại của task', () => {
    const r = res as Record<string, unknown>;
    expect(r.assigneeTeamId).toBeUndefined();
    expect(r.teamId).toBeUndefined();
    expect(r.ownerId).toBeUndefined();
    expect(r.assigneeId).toBeUndefined();
    expect(r.deletedAt).toBeUndefined();
    expect(r.passwordHash).toBeUndefined();
  });

  it('KHÔNG lộ field thừa trên owner/assignee lồng (chỉ {id,name})', () => {
    const owner = res.owner as Record<string, unknown>;
    const assignee = res.assignee as Record<string, unknown>;
    expect(owner.passwordHash).toBeUndefined();
    expect(owner.email).toBeUndefined();
    expect(assignee.passwordHash).toBeUndefined();
    expect(assignee.teamId).toBeUndefined();
  });
});
