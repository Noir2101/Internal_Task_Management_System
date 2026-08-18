import { Clock } from '../../common/clock';
import { Task } from '../domain/task.entity';
import { CreateTask } from './create-task.usecase';
import { AssignedEvent, Notifier } from './ports/notifier.port';
import { CreateTaskInput, TaskWritePort } from './ports/task-write.port';

const FIXED: Clock = { now: () => new Date('2026-06-29T00:00:00.000Z') };

const makeTask = (assigneeId = 'assignee1', ownerId = 'owner1'): Task =>
  new Task({
    id: 't1',
    title: 'T',
    description: null,
    progress: 'TODO',
    deadline: null,
    owner: { id: ownerId, name: 'Owner' },
    assignee: { id: assigneeId, name: 'Assignee' },
    assigneeTeamId: 'teamA',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  });

/** Fake write port — `create` phản chiếu assigneeId/ownerId vào task trả về. */
class FakeWrite implements TaskWritePort {
  create(input: CreateTaskInput): Promise<Task> {
    return Promise.resolve(makeTask(input.assigneeId, input.ownerId));
  }
  updateDefinition(): Promise<Task> {
    return Promise.resolve(makeTask());
  }
  updateProgress(): Promise<Task> {
    return Promise.resolve(makeTask());
  }
  reassign(): Promise<Task> {
    return Promise.resolve(makeTask());
  }
  softDelete(): Promise<void> {
    return Promise.resolve();
  }
  isTeamMember(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Spy Notifier — chỉ ghi lại event assigned (không chạm mạng; giữ NoopNotifier cho toàn bộ đường còn lại). */
class SpyNotifier implements Notifier {
  readonly assigned: AssignedEvent[] = [];
  notifyAssigned(event: AssignedEvent): Promise<void> {
    this.assigned.push(event);
    return Promise.resolve();
  }
  notifyReassigned(): Promise<void> {
    return Promise.resolve();
  }
  notifyTasksOrphaned(): Promise<void> {
    return Promise.resolve();
  }
  // Hook thứ tư (GĐ11 slice 2) phát từ lịch định kỳ, không từ use-case — CreateTask không đụng tới.
  notifyOverdueDigest(): Promise<void> {
    return Promise.resolve();
  }
}

describe('CreateTask — notify-on-assign (seam)', () => {
  it('giao cho người KHÁC → phát notifyAssigned mang đúng ID (không mang email)', async () => {
    const notifier = new SpyNotifier();
    const uc = new CreateTask(new FakeWrite(), notifier, FIXED);

    await uc.execute({
      ownerId: 'owner1',
      role: 'LEADER',
      scopeTeamId: 'teamA',
      input: {
        title: 'T',
        description: null,
        deadline: null,
        assigneeId: 'assignee1',
      },
    });

    expect(notifier.assigned).toEqual([
      { taskId: 't1', assigneeId: 'assignee1', ownerId: 'owner1' },
    ]);
  });

  it('tự-giao (assignee === owner) → KHÔNG phát notifyAssigned', async () => {
    const notifier = new SpyNotifier();
    const uc = new CreateTask(new FakeWrite(), notifier, FIXED);

    await uc.execute({
      ownerId: 'owner1',
      role: 'MEMBER',
      scopeTeamId: 'teamA',
      input: {
        title: 'T',
        description: null,
        deadline: null,
        assigneeId: 'owner1',
      },
    });

    expect(notifier.assigned).toHaveLength(0);
  });
});
