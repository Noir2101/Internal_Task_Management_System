import { Clock } from '../../common/clock';
import {
  ForbiddenError,
  NotFoundError,
} from '../../common/exceptions/domain.exception';
import { Progress, Task } from '../domain/task.entity';
import { EditDefinition } from './edit-definition.usecase';
import { GetTask } from './get-task.usecase';
import { ListTasksResult, TaskQueryPort } from './ports/task-query.port';
import { TaskWritePort, UpdateDefinitionInput } from './ports/task-write.port';

const FIXED: Clock = { now: () => new Date('2026-06-29T00:00:00.000Z') };

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
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  });

/** Fake in-memory thay PrismaTaskRepository — scoped-load = match id + assigneeTeamId (cổng keystone). */
class FakeRepo implements TaskQueryPort, TaskWritePort {
  constructor(private readonly tasks: Task[]) {}

  findByIdScoped(id: string, scopeTeamId: string | null): Promise<Task | null> {
    const t = this.tasks.find(
      (x) => x.id === id && x.assigneeTeamId === scopeTeamId,
    );
    return Promise.resolve(t ?? null);
  }
  list(): Promise<ListTasksResult> {
    return Promise.resolve({ items: this.tasks, total: this.tasks.length });
  }
  create(): Promise<Task> {
    return Promise.resolve(makeTask());
  }
  updateDefinition(id: string, input: UpdateDefinitionInput): Promise<Task> {
    return Promise.resolve(makeTask({ id, title: input.title ?? 'T' }));
  }
  updateProgress(id: string, progress: Progress): Promise<Task> {
    return Promise.resolve(makeTask({ id, progress }));
  }
  reassign(id: string, assigneeId: string): Promise<Task> {
    return Promise.resolve(
      makeTask({ id, assignee: { id: assigneeId, name: 'X' } }),
    );
  }
  softDelete(): Promise<void> {
    return Promise.resolve();
  }
  isTeamMember(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Keystone — GetTask (docs/06 §3.2)', () => {
  it('ngoài nhóm (scoped-load miss) → NotFoundError (→404 RESOURCE_NOT_FOUND)', async () => {
    const repo = new FakeRepo([makeTask({ assigneeTeamId: 'teamA' })]);
    const getTask = new GetTask(repo, FIXED);
    // người gọi ở teamB hỏi task của teamA → repo trả null → loadOr404 ném.
    await expect(getTask.execute('t1', 'teamB')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('không tồn tại → NotFoundError', async () => {
    const getTask = new GetTask(new FakeRepo([]), FIXED);
    await expect(getTask.execute('nope', 'teamA')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('trong nhóm → trả task + cờ overdue đúng (cùng now)', async () => {
    const overdueTask = makeTask({
      deadline: new Date('2026-06-28T00:00:00.000Z'), // < now, chưa DONE
      progress: 'IN_PROGRESS',
    });
    const getTask = new GetTask(new FakeRepo([overdueTask]), FIXED);
    const view = await getTask.execute('t1', 'teamA');
    expect(view.task.id).toBe('t1');
    expect(view.overdue).toBe(true);
  });
});

describe('Keystone — 403 trên mutation non-owner (EditDefinition, docs/06 §3.1)', () => {
  it('non-owner trong nhóm → ForbiddenError(NOT_TASK_OWNER) (→403)', async () => {
    const repo = new FakeRepo([
      makeTask({ owner: { id: 'owner1', name: 'O' } }),
    ]);
    const edit = new EditDefinition(repo, repo, FIXED);
    const err = await edit
      .execute({
        id: 't1',
        userId: 'someone-else', // KHÔNG phải owner1
        scopeTeamId: 'teamA', // CÙNG nhóm → thấy được → 403 (không phải 404)
        input: { title: 'New' },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).code).toBe('NOT_TASK_OWNER');
  });

  it('owner → sửa được, trả view', async () => {
    const repo = new FakeRepo([makeTask()]);
    const edit = new EditDefinition(repo, repo, FIXED);
    const view = await edit.execute({
      id: 't1',
      userId: 'owner1',
      scopeTeamId: 'teamA',
      input: { title: 'New title' },
    });
    expect(view.task.title).toBe('New title');
  });

  it('ngoài nhóm → 404 (NotFound) ưu tiên trước cả check owner', async () => {
    const repo = new FakeRepo([makeTask()]);
    const edit = new EditDefinition(repo, repo, FIXED);
    await expect(
      edit.execute({
        id: 't1',
        userId: 'owner1',
        scopeTeamId: 'teamB', // ngoài nhóm → scoped-load miss
        input: { title: 'New' },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
