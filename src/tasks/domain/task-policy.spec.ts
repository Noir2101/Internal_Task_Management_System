import { Task } from './task.entity';
import { TaskPolicy } from './task-policy';

const makeTask = (
  over: Partial<ConstructorParameters<typeof Task>[0]> = {},
): Task =>
  new Task({
    id: 't1',
    title: 'T',
    description: null,
    progress: 'TODO',
    deadline: null,
    owner: { id: 'owner1', name: 'Owner' },
    assignee: { id: 'assignee1', name: 'Assignee' },
    assigneeTeamId: 'teamA',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

describe('TaskPolicy — record-level (docs/06 §3)', () => {
  describe('isOwner', () => {
    it('đúng owner ⇒ true', () => {
      expect(TaskPolicy.isOwner('owner1', makeTask())).toBe(true);
    });
    it('không phải owner ⇒ false', () => {
      expect(TaskPolicy.isOwner('assignee1', makeTask())).toBe(false);
      expect(TaskPolicy.isOwner('stranger', makeTask())).toBe(false);
    });
  });

  describe('isAssignee', () => {
    it('đúng assignee ⇒ true', () => {
      expect(TaskPolicy.isAssignee('assignee1', makeTask())).toBe(true);
    });
    it('không phải assignee ⇒ false', () => {
      expect(TaskPolicy.isAssignee('owner1', makeTask())).toBe(false);
    });
  });

  describe('isSameTeam (scope = nhóm của assignee)', () => {
    it('cùng nhóm ⇒ true', () => {
      expect(TaskPolicy.isSameTeam('teamA', makeTask())).toBe(true);
    });
    it('khác nhóm ⇒ false', () => {
      expect(TaskPolicy.isSameTeam('teamB', makeTask())).toBe(false);
    });
    it('admin (teamId null) KHÔNG thuộc nhóm nào ⇒ false', () => {
      expect(TaskPolicy.isSameTeam(null, makeTask())).toBe(false);
    });
  });

  it('ownership ≠ assignment: owner và assignee là hai quyền độc lập trên cùng task', () => {
    // member tự tạo: owner === assignee (cùng người, hai vai)
    const selfTask = makeTask({
      owner: { id: 'u', name: 'U' },
      assignee: { id: 'u', name: 'U' },
    });
    expect(TaskPolicy.isOwner('u', selfTask)).toBe(true);
    expect(TaskPolicy.isAssignee('u', selfTask)).toBe(true);

    // leader giao member: owner ≠ assignee — không suy ra nhau
    const t = makeTask();
    expect(TaskPolicy.isOwner('owner1', t)).toBe(true);
    expect(TaskPolicy.isAssignee('owner1', t)).toBe(false); // owner KHÔNG tự là assignee
    expect(TaskPolicy.isOwner('assignee1', t)).toBe(false); // assignee KHÔNG tự là owner
    expect(TaskPolicy.isAssignee('assignee1', t)).toBe(true);
  });
});
