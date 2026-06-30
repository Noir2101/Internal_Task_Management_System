import { Injectable } from '@nestjs/common';
import { Role, Team, User } from '@prisma/client';
import { loadOr404 } from '../common/authz/scoped';
import { PrismaService } from '../prisma/prisma.service';
import {
  LeaderNotTeamMemberException,
  TeamNameTakenException,
  TeamNotEmptyException,
} from './teams.exceptions';

/**
 * Teams (THIN): inject PrismaService TRỰC TIẾP (KHÔNG port — DIP chỉ ở Tasks). Trả model Prisma cho
 * controller `project()` (cổng 2 default-deny). Luật nghiệp vụ ở đây, KHÔNG ở DTO.
 *   - tên-trùng → pre-check TEAM_NAME_TAKEN (P2002 safety-net để Bước 7).
 *   - leader-swap ATOMIC ($transaction): demote leader cũ → MEMBER TRƯỚC, rồi promote (giữ ≤1
 *     LEADER/team — không vỡ partial-unique). userId phải member đang hoạt động → LEADER_NOT_TEAM_MEMBER.
 */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string): Promise<Team> {
    const existing = await this.prisma.team.findUnique({ where: { name } });
    if (existing) throw new TeamNameTakenException();
    return this.prisma.team.create({ data: { name } });
  }

  /** docs/06 §9.2 im lặng phân trang cho /teams → mảng thường (nhóm ít). Sort tất định như Tasks §4.1. */
  async list(): Promise<Team[]> {
    return this.prisma.team.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getById(id: string): Promise<Team> {
    return loadOr404(await this.prisma.team.findUnique({ where: { id } }));
  }

  async rename(id: string, name: string): Promise<Team> {
    const team = loadOr404(
      await this.prisma.team.findUnique({ where: { id } }),
    );
    if (name !== team.name) {
      const clash = await this.prisma.team.findUnique({ where: { name } });
      if (clash) throw new TeamNameTakenException();
    }
    return this.prisma.team.update({ where: { id }, data: { name } });
  }

  /**
   * PUT /teams/:id/leader (§9.3). Swap atomic. userId đã là leader → demote-rồi-promote chính mình
   * ⇒ vẫn LEADER (idempotent). Throw trong $transaction để rollback nếu userId không hợp lệ (đúng:
   * không muốn swap dở dang — khác bug Bước 2 nơi side-effect cần COMMIT).
   */
  async setLeader(teamId: string, userId: string): Promise<Team> {
    const team = loadOr404(
      await this.prisma.team.findUnique({ where: { id: teamId } }),
    );
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.user.findFirst({
        where: { id: userId, teamId, isActive: true },
        select: { id: true },
      });
      if (!member) throw new LeaderNotTeamMemberException();
      await tx.user.updateMany({
        where: { teamId, role: Role.LEADER },
        data: { role: Role.MEMBER },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: Role.LEADER },
      });
    });
    // Team không có cột leader (leadership derive từ User) → row team không đổi.
    return team;
  }

  /**
   * Break-glass DELETE /teams/:id (§9.4). Hard-delete row Team (Team KHÔNG có tombstone) → 204.
   * "Empty" = KHÔNG còn User nào trỏ teamId (đếm CẢ inactive — teamId bất biến §9.5 + FK Restrict
   * chặn theo sự tồn tại row, không theo isActive). Còn member → 409 TEAM_NOT_EMPTY (pre-check là
   * đường chính; P2003 từ filter Bước 7 đỡ ca đua). Log seam do BreakGlassInterceptor ghi ở rìa.
   */
  async remove(id: string): Promise<void> {
    loadOr404(await this.prisma.team.findUnique({ where: { id } }));
    const members = await this.prisma.user.count({ where: { teamId: id } });
    if (members > 0) throw new TeamNotEmptyException();
    await this.prisma.team.delete({ where: { id } });
  }

  /** Roster — member đang hoạt động của nhóm. Scope (nhóm khác → 404) kiểm ở controller theo teamId người gọi. */
  async listMembers(teamId: string): Promise<Pick<User, 'id' | 'name'>[]> {
    return this.prisma.user.findMany({
      where: { teamId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
