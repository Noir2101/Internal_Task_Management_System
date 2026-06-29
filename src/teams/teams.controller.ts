import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/authz/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
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
