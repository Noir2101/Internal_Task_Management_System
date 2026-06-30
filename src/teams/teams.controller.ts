import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BreakGlass } from '../common/authz/break-glass.decorator';
import { CurrentUser } from '../common/authz/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { BreakGlassInterceptor } from '../common/break-glass.interceptor';
import { NotFoundError } from '../common/exceptions/domain.exception';
import { project } from '../common/projection';
import { MemberBrief, TeamResponse } from './dto/team.response';
import { CreateTeamDto } from './dto/create-team.dto';
import { SetLeaderDto } from './dto/set-leader.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

/**
 * Teams (docs/06 §9). JwtAuthGuard global đã bảo vệ; `@UseGuards(RolesGuard)` thêm guard vai trò.
 * Admin-only đi nhánh `hide` → 404 RESOURCE_NOT_FOUND (giấu surface admin) — KHÔNG dùng `forbid`/
 * `FORBIDDEN` (code đó treo tới Bước 6 /stats). `@Roles` gắn PER-METHOD để CHỪA roster (không admin-only).
 * Mọi response qua `project()` (cổng 2) — KHÔNG serialize model Prisma.
 */
@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post()
  @Roles([Role.ADMIN])
  @ApiOperation({ summary: 'Tạo nhóm (admin)' })
  @ApiCreatedResponse({ type: TeamResponse })
  async create(@Body() dto: CreateTeamDto): Promise<TeamResponse> {
    return project(TeamResponse, await this.teams.create(dto.name));
  }

  @Get()
  @Roles([Role.ADMIN])
  @ApiOperation({ summary: 'List nhóm (admin)' })
  @ApiOkResponse({ type: [TeamResponse] })
  async list(): Promise<TeamResponse[]> {
    const teams = await this.teams.list();
    return teams.map((t) => project(TeamResponse, t));
  }

  @Get(':id')
  @Roles([Role.ADMIN])
  @ApiOperation({ summary: 'Xem một nhóm (admin)' })
  @ApiOkResponse({ type: TeamResponse })
  async getOne(@Param('id') id: string): Promise<TeamResponse> {
    return project(TeamResponse, await this.teams.getById(id));
  }

  @Patch(':id')
  @Roles([Role.ADMIN])
  @ApiOperation({ summary: 'Đổi tên nhóm (admin)' })
  @ApiOkResponse({ type: TeamResponse })
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamResponse> {
    return project(TeamResponse, await this.teams.rename(id, dto.name));
  }

  /** Đặt leader — SWAP ATOMIC (§9.3). Thành công → 200 + TeamResponse. */
  @Put(':id/leader')
  @Roles([Role.ADMIN])
  @ApiOperation({ summary: 'Đặt leader của nhóm (admin) — swap atomic' })
  @ApiOkResponse({ type: TeamResponse })
  async setLeader(
    @Param('id') id: string,
    @Body() dto: SetLeaderDto,
  ): Promise<TeamResponse> {
    return project(TeamResponse, await this.teams.setLeader(id, dto.userId));
  }

  /**
   * Break-glass giải thể nhóm (§9.4). Admin-only đi nhánh `hide`→404 như các route team khác. Nhóm
   * rỗng → 204 (hard-delete, KHÔNG un-delete); còn member → 409 TEAM_NOT_EMPTY. `BreakGlassInterceptor`
   * ghi MỘT dòng log {actor, action, target, time} ra stdout mỗi lần gọi (mầm audit-log, §9.1/§11).
   */
  @Delete(':id')
  @Roles([Role.ADMIN])
  @BreakGlass('DELETE_TEAM')
  @UseInterceptors(BreakGlassInterceptor)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Giải thể nhóm (admin, BREAK-GLASS)',
    description:
      'Thao tác break-glass ngoài policy thường: hard-delete nhóm rỗng (→204), còn member →409 ' +
      'TEAM_NOT_EMPTY. Mỗi lần gọi ghi một dòng log ứng dụng {actor, action, target, thời điểm} ra stdout.',
  })
  @ApiNoContentResponse({ description: 'Đã giải thể nhóm rỗng.' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.teams.remove(id);
  }

  /**
   * Roster — KHÔNG admin-only (không `@Roles`). Scope theo `teamId` người gọi: nhóm khác (gồm admin
   * teamId=null) → 404 RESOURCE_NOT_FOUND (giấu tồn tại, đúng keystone §3.2).
   */
  @Get(':id/members')
  @ApiOperation({ summary: 'Roster nhóm của chính mình (member trong nhóm)' })
  @ApiOkResponse({ type: [MemberBrief] })
  async members(
    @Param('id') id: string,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<MemberBrief[]> {
    if (scopeTeamId !== id) throw new NotFoundError();
    const members = await this.teams.listMembers(id);
    return members.map((m) => project(MemberBrief, m));
  }
}
