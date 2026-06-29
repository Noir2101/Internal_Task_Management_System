import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
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
import { project } from '../common/projection';
import { CreateUserDto } from './dto/create-user.dto';
import {
  DeactivateUserResponse,
  ReactivateUserResponse,
} from './dto/deactivate.response';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UserListResponse } from './dto/user-list.response';
import { UserResponse } from './dto/user.response';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Users (docs/06 §9). Admin-only TOÀN BỘ → `@Roles([ADMIN])` class-level, nhánh `hide` → 404
 * RESOURCE_NOT_FOUND (giấu surface admin; KHÔNG `forbid`/`FORBIDDEN`). JwtAuthGuard global +
 * `@UseGuards(RolesGuard)`. Mọi response qua `project()` (cổng 2) — KHÔNG lộ passwordHash.
 * deactivate/reactivate trả 200 (cần trạng thái mới — §10); POST → 201; PATCH → 200.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([Role.ADMIN])
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo user (admin)' })
  @ApiCreatedResponse({ type: UserResponse })
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return project(
      UserResponse,
      await this.users.create({
        email: dto.email,
        name: dto.name,
        password: dto.password,
        role: dto.role,
        teamId: dto.teamId,
      }),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List user (lọc role/teamId/includeInactive + phân trang)',
  })
  @ApiOkResponse({ type: UserListResponse })
  async list(@Query() query: ListUsersQueryDto): Promise<UserListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.users.list({
      role: query.role,
      teamId: query.teamId,
      includeInactive: query.includeInactive,
      page,
      limit,
    });
    return {
      data: items.map((u) => project(UserResponse, u)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem một user (admin)' })
  @ApiOkResponse({ type: UserResponse })
  async getOne(@Param('id') id: string): Promise<UserResponse> {
    return project(UserResponse, await this.users.getById(id));
  }

  /** Sửa hồ sơ — CHỈ name (teamId & role bất biến — §9.5). */
  @Patch(':id')
  @ApiOperation({ summary: 'Đổi tên user (admin)' })
  @ApiOkResponse({ type: UserResponse })
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return project(UserResponse, await this.users.rename(id, dto.name));
  }

  /** Vô hiệu hoá (§9.3) → 200 {user, orphanedTaskCount} + revoke refresh token + báo leader. */
  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vô hiệu hoá user (admin)' })
  @ApiOkResponse({ type: DeactivateUserResponse })
  async deactivate(
    @Param('id') id: string,
    @CurrentUser('sub') callerSub: string,
  ): Promise<DeactivateUserResponse> {
    const { user, orphanedTaskCount } = await this.users.deactivate(
      id,
      callerSub,
    );
    return { user: project(UserResponse, user), orphanedTaskCount };
  }

  /** Kích hoạt lại (§9.3) → 200 {user}. CHỈ lật isActive, vẫn MEMBER. */
  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Kích hoạt lại user (admin)' })
  @ApiOkResponse({ type: ReactivateUserResponse })
  async reactivate(@Param('id') id: string): Promise<ReactivateUserResponse> {
    return { user: project(UserResponse, await this.users.reactivate(id)) };
  }
}
