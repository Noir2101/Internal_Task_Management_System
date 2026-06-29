import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { loadOr404 } from '../common/authz/scoped';
import { NotFoundError } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFIER,
  type Notifier,
} from '../tasks/application/ports/notifier.port';
import {
  TASK_QUERY_PORT,
  type TaskQueryPort,
} from '../tasks/application/ports/task-query.port';
import {
  CannotDisableSelfException,
  EmailTakenException,
  LastAdminException,
  LeaderAlreadyExistsException,
  LeaderReplacementRequiredException,
} from './users.exceptions';

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: Role;
  teamId?: string;
}

interface ListUsersInput {
  role?: Role;
  teamId?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
}

/**
 * Users (THIN): inject PrismaService TRỰC TIẾP (KHÔNG port — DIP chỉ ở Tasks). Tiêu thụ artifact Tasks
 * cho deactivate: `TaskQueryPort.countByAssignee` (đếm task treo, non-scoped) + `Notifier` (báo leader).
 * Chiều phụ thuộc Users→Tasks (build-plan §1) — KHÔNG để Tasks phụ thuộc ngược. Trả model Prisma cho
 * controller `project()` (cổng 2). Luật nghiệp vụ ở đây, KHÔNG ở DTO (DTO chỉ hình thức + CHECK admin↔team).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TASK_QUERY_PORT) private readonly taskQuery: TaskQueryPort,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw new EmailTakenException();

    // ADMIN: teamId vắng (DTO CHECK) → lưu null. LEADER/MEMBER: teamId có → verify team + (leader) trống ghế.
    let teamId: string | null = null;
    if (input.role !== Role.ADMIN) {
      teamId = input.teamId!;
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) throw new NotFoundError(); // teamId trỏ team không tồn tại → 404 (reuse RESOURCE_NOT_FOUND)
      if (input.role === Role.LEADER) {
        const leaderCount = await this.prisma.user.count({
          where: { teamId, role: Role.LEADER },
        });
        if (leaderCount > 0) throw new LeaderAlreadyExistsException();
      }
    }

    const passwordHash = await argon2.hash(input.password); // khớp seed/auth (cùng option mặc định)
    return this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        teamId,
      },
    });
  }

  async list(input: ListUsersInput): Promise<{ items: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {};
    if (input.role) where.role = input.role;
    if (input.teamId) where.teamId = input.teamId;
    if (!input.includeInactive) where.isActive = true; // default scope loại inactive (CLAUDE.md lifecycle)

    const skip = (input.page - 1) * input.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // sort tất định như Tasks §4.1
        skip,
        take: input.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string): Promise<User> {
    return loadOr404(await this.prisma.user.findUnique({ where: { id } }));
  }

  async rename(id: string, name: string): Promise<User> {
    loadOr404(await this.prisma.user.findUnique({ where: { id } }));
    return this.prisma.user.update({ where: { id }, data: { name } });
  }

  /**
   * POST /users/:id/deactivate (§9.3). Thứ tự guard CẤM đảo: self → leader → last-admin. Thành công:
   * set isActive=false + REVOKE refresh token của user (đóng deviation Bước 2) ATOMIC; phát Notifier
   * báo leader SAU commit (side-effect không đặt trong $transaction — bài học Bước 2). Đếm task treo
   * non-scoped theo assigneeId (admin không nhóm, không đi qua scoped-load).
   */
  async deactivate(
    targetId: string,
    callerSub: string,
  ): Promise<{ user: User; orphanedTaskCount: number }> {
    const target = loadOr404(
      await this.prisma.user.findUnique({ where: { id: targetId } }),
    );
    if (target.id === callerSub) throw new CannotDisableSelfException();
    if (target.role === Role.LEADER) {
      throw new LeaderReplacementRequiredException(); // KHÔNG phát gì khi đối tượng là leader (§9.3)
    }
    if (target.role === Role.ADMIN) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: Role.ADMIN, isActive: true, id: { not: targetId } },
      });
      if (otherActiveAdmins === 0) throw new LastAdminException();
    }

    const orphanedTaskCount = await this.taskQuery.countByAssignee(targetId);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() }, // revoke mọi refresh sống → refresh sau đó 401 SESSION_EXPIRED
      }),
    ]);

    // Báo leader chỉ khi là member còn task treo (admin không nhóm / 0 task → không phát).
    if (target.teamId && orphanedTaskCount > 0) {
      await this.notifier.notifyTasksOrphaned({
        deactivatedUserId: targetId,
        teamId: target.teamId,
        orphanedTaskCount,
      });
    }
    return { user, orphanedTaskCount };
  }

  /** POST /users/:id/reactivate (§9.3): CHỈ lật isActive=true, KHÔNG đụng role (§9.5 — vốn đã là MEMBER). */
  async reactivate(targetId: string): Promise<User> {
    loadOr404(await this.prisma.user.findUnique({ where: { id: targetId } }));
    return this.prisma.user.update({
      where: { id: targetId },
      data: { isActive: true },
    });
  }
}
