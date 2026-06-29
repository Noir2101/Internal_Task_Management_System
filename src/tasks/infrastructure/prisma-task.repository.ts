import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Task } from '../domain/task.entity';
import {
  ListTasksQuery,
  ListTasksResult,
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
    // OVERDUE = deadline < now AND progress != DONE.
    and.push({ deadline: { lt: q.now } });
    and.push({ progress: { not: 'DONE' } });
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
