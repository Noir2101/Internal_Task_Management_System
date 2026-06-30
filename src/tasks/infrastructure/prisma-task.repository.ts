import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Progress, Task, UserRef } from '../domain/task.entity';
import {
  AssigneeAggregate,
  ListTasksQuery,
  ListTasksResult,
  TaskAggregate,
  TaskQueryPort,
} from '../application/ports/task-query.port';
import {
  CreateTaskInput,
  TaskWritePort,
  UpdateDefinitionInput,
} from '../application/ports/task-write.port';

/** owner/assignee lồng + `assignee.teamId` để suy scope (assigneeTeamId) — KHÔNG lộ ra response. */
const taskInclude = {
  owner: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, teamId: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/**
 * Adapter Prisma — hiện thực CẢ TaskWritePort + TaskQueryPort (bind 2 token qua `useExisting`).
 * Map domain↔Prisma CHỈ Ở ĐÂY (không rò type Prisma ra ngoài). Đọc bảng User để validate assignee
 * (Tasks cần bảng User, KHÔNG phụ thuộc module Users).
 *
 * scoped-load (keystone): mọi đường đọc lọc `assignee.teamId === scopeTeamId` (+ `deletedAt: null`).
 * Admin (scopeTeamId=null) → khớp assignee teamId NULL (không có) → rỗng/null → tự bị chặn khỏi /tasks.
 */
@Injectable()
export class PrismaTaskRepository implements TaskQueryPort, TaskWritePort {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── ĐỌC (TaskQueryPort) ─────────────

  async findByIdScoped(
    id: string,
    scopeTeamId: string | null,
  ): Promise<Task | null> {
    const row = await this.prisma.task.findFirst({
      where: { id, deletedAt: null, assignee: { is: { teamId: scopeTeamId } } },
      include: taskInclude,
    });
    return row ? toDomain(row) : null;
  }

  async list(q: ListTasksQuery): Promise<ListTasksResult> {
    const where = buildListWhere(q);
    // findMany + count trong một transaction → total khớp đúng tập đã lọc (PERF-02/03).
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        // sort cố định, id tiebreak ⇒ trang tất định (docs/06 §4.1).
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  /**
   * Aggregate read-model cho Stats (docs/06 §5). Outer-join User×Task bằng groupBy + union TRONG
   * adapter (đọc bảng User/Team trực tiếp — KHÔNG phụ thuộc module Users/Teams; Stats KHÔNG thấy Prisma).
   * 3 bất biến OVERDUE ép bằng cấu trúc:
   *   - `byProgress` khởi tạo đủ 3 key (0 nếu rảnh) — KHÔNG bucket OVERDUE thứ tư.
   *   - `overdue` từ groupBy RIÊNG với `overduePredicate` (sibling) — không đếm trùng.
   *   - team-level DERIVE từ per-assignee ⇒ `total = Σ byProgress = Σ byAssignee`; overdue ngoài total.
   * overdue dùng CHUNG `now` (Clock) + ĐÚNG predicate với cờ/filter list.
   */
  async aggregate(scopeTeamId: string, now: Date): Promise<TaskAggregate> {
    // scope = nhóm của assignee (suy ra) + non-deleted — ĐÚNG scoped-load của list/findByIdScoped.
    const scopeWhere: Prisma.TaskWhereInput = {
      deletedAt: null,
      assignee: { is: { teamId: scopeTeamId } },
    };
    const overdueWhere: Prisma.TaskWhereInput = {
      ...scopeWhere,
      ...overduePredicate(now),
    };

    const [team, progressRows, overdueRows, activeMembers] = await Promise.all([
      this.prisma.team.findUnique({
        where: { id: scopeTeamId },
        select: { name: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId', 'progress'],
        where: scopeWhere,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: overdueWhere,
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { teamId: scopeTeamId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    // byAssignee = HỢP(member đang hoạt động ∪ assignee còn task). Khởi tạo member active trước
    // (rảnh → toàn 0); bổ sung assignee inactive còn task treo (có trong task nhưng không active).
    const acc = new Map<string, AssigneeAggregate>();
    const ensure = (assignee: UserRef): AssigneeAggregate => {
      let row = acc.get(assignee.id);
      if (!row) {
        row = {
          assignee,
          byProgress: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
          overdue: 0,
        };
        acc.set(assignee.id, row);
      }
      return row;
    };
    for (const m of activeMembers) ensure(m);

    const extraIds = [
      ...new Set(
        progressRows.map((r) => r.assigneeId).filter((id) => !acc.has(id)),
      ),
    ];
    if (extraIds.length) {
      const extras = await this.prisma.user.findMany({
        where: { id: { in: extraIds } },
        select: { id: true, name: true },
      });
      for (const u of extras) ensure(u);
    }

    for (const r of progressRows) {
      const row = acc.get(r.assigneeId);
      if (row) row.byProgress[r.progress] += r._count._all;
    }
    for (const r of overdueRows) {
      const row = acc.get(r.assigneeId);
      if (row) row.overdue += r._count._all;
    }

    const byAssignee = [...acc.values()].sort((a, b) =>
      a.assignee.name.localeCompare(b.assignee.name),
    );

    // Team-level DERIVE (reduce per-assignee) ⇒ total = Σ byProgress = Σ byAssignee, cấu trúc bảo chứng.
    const byProgress: Record<Progress, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
    };
    let overdue = 0;
    for (const row of byAssignee) {
      byProgress.TODO += row.byProgress.TODO;
      byProgress.IN_PROGRESS += row.byProgress.IN_PROGRESS;
      byProgress.DONE += row.byProgress.DONE;
      overdue += row.overdue;
    }
    const total = byProgress.TODO + byProgress.IN_PROGRESS + byProgress.DONE;

    return {
      scope: { teamId: scopeTeamId, teamName: team?.name ?? '' },
      total,
      byProgress,
      overdue,
      byAssignee,
    };
  }

  // ───────────── GHI (TaskWritePort) ─────────────

  async create(input: CreateTaskInput): Promise<Task> {
    const row = await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        deadline: input.deadline,
        ownerId: input.ownerId,
        assigneeId: input.assigneeId,
        // progress dùng default DB = TODO.
      },
      include: taskInclude,
    });
    return toDomain(row);
  }

  async updateDefinition(
    id: string,
    input: UpdateDefinitionInput,
  ): Promise<Task> {
    // Prisma bỏ qua field `undefined` ⇒ chỉ field được gửi mới đổi; `null` set null tường minh.
    const row = await this.prisma.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        deadline: input.deadline,
      },
      include: taskInclude,
    });
    return toDomain(row);
  }

  async updateProgress(id: string, progress: Task['progress']): Promise<Task> {
    const row = await this.prisma.task.update({
      where: { id },
      data: { progress },
      include: taskInclude,
    });
    return toDomain(row);
  }

  async reassign(id: string, assigneeId: string): Promise<Task> {
    const row = await this.prisma.task.update({
      where: { id },
      data: { assigneeId },
      include: taskInclude,
    });
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    // Tombstone (deletedAt) — không liên quan mốc OVERDUE nên dùng giờ hiện tại tại adapter.
    await this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countByAssignee(assigneeId: string): Promise<number> {
    // KHÔNG scoped (không lọc theo nhóm) — đếm thẳng theo assigneeId task treo (chưa-DONE, non-deleted).
    // Dùng bởi luồng admin deactivate (Bước 5) cho `orphanedTaskCount` (docs/06 §9.3).
    return this.prisma.task.count({
      where: { assigneeId, deletedAt: null, progress: { not: 'DONE' } },
    });
  }

  async isTeamMember(
    userId: string,
    teamId: string,
    opts?: { activeOnly?: boolean },
  ): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        teamId,
        ...(opts?.activeOnly ? { isActive: true } : {}),
      },
      select: { id: true },
    });
    return user !== null;
  }
}

/**
 * Predicate OVERDUE = deadline < now AND progress != DONE (docs/06 §4 / DueStatus domain).
 * NGUỒN DUY NHẤT cho cả filter `?overdue=true` (list) lẫn `aggregate` ⇒ hai chỗ không thể lệch
 * predicate (deadline NULL & DONE-quá-hạn tự bị loại). Mốc `now` truyền vào từ Clock (cổng 3).
 */
function overduePredicate(now: Date): Prisma.TaskWhereInput {
  return { deadline: { lt: now }, progress: { not: 'DONE' } };
}

/** WHERE cho list — filter AND nhau; overdue dùng `q.now` (cùng mốc với cờ — cổng 3). */
function buildListWhere(q: ListTasksQuery): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [];
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    assignee: { is: { teamId: q.scopeTeamId } },
  };

  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.progress) where.progress = q.progress;
  if (q.q) {
    and.push({
      OR: [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }

  if (q.overdue === true) {
    and.push(overduePredicate(q.now));
  } else if (q.overdue === false) {
    // NOT overdue = không deadline HOẶC chưa tới hạn HOẶC đã DONE.
    and.push({
      OR: [
        { deadline: null },
        { deadline: { gte: q.now } },
        { progress: 'DONE' },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

/** Map Prisma row → domain Task. `assigneeTeamId` suy từ assignee (KHÔNG cột trên Task). */
function toDomain(row: TaskRow): Task {
  return new Task({
    id: row.id,
    title: row.title,
    description: row.description,
    progress: row.progress,
    deadline: row.deadline,
    owner: { id: row.owner.id, name: row.owner.name },
    assignee: { id: row.assignee.id, name: row.assignee.name },
    assigneeTeamId: row.assignee.teamId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
