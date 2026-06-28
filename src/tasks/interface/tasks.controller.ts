import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
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
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { CreateTask } from '../application/create-task.usecase';
import { DeleteTask } from '../application/delete-task.usecase';
import { EditDefinition } from '../application/edit-definition.usecase';
import { GetTask } from '../application/get-task.usecase';
import { ListTasks } from '../application/list-tasks.usecase';
import { ReassignTask } from '../application/reassign-task.usecase';
import { UpdateProgress } from '../application/update-progress.usecase';
import { TaskView } from '../application/task-view';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks.query.dto';
import { ReassignDto } from './dto/reassign.dto';
import { TaskListResponse } from './dto/task-list.response';
import { TaskResponse, toTaskResponse } from './dto/task.response';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Tasks endpoints (docs/06 §3/§4). Authz là RECORD-LEVEL trong use-case (SAU scoped-load) —
 * KHÔNG `@Roles()` ở rìa (rìa chạy trước scoped-load ⇒ member cross-team sẽ bị 403 thay vì 404,
 * phá keystone §3.2). `ownerId`=`sub`, scope=`teamId`, `role` lấy từ claims, KHÔNG nhận từ body
 * (chống mass-assignment). Mọi route mặc-định-bảo-vệ bởi JwtAuthGuard global (không `@Public`).
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly createTask: CreateTask,
    private readonly listTasks: ListTasks,
    private readonly getTask: GetTask,
    private readonly editDefinition: EditDefinition,
    private readonly updateProgress: UpdateProgress,
    private readonly reassignTask: ReassignTask,
    private readonly deleteTask: DeleteTask,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Tạo task (leader giao in-team / member tự giao)' })
  @ApiCreatedResponse({ type: TaskResponse })
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('sub') ownerId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskResponse> {
    return toResponse(
      await this.createTask.execute({
        ownerId,
        role,
        scopeTeamId,
        input: {
          title: dto.title,
          description: dto.description ?? null,
          deadline: parseDeadline(dto.deadline) ?? null,
          assigneeId: dto.assigneeId,
          allowPastDeadline: dto.allowPastDeadline,
        },
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List task trong nhóm (lọc + phân trang)' })
  @ApiOkResponse({ type: TaskListResponse })
  async list(
    @Query() query: ListTasksQueryDto,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.listTasks.execute({
      scopeTeamId,
      page,
      limit,
      progress: query.progress,
      overdue: query.overdue,
      assigneeId: query.assigneeId,
      q: query.q,
    });
    return {
      data: result.items.map(toResponse),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  /** KEYSTONE: ngoài nhóm → 404; trong nhóm → 200 + projection. KHÔNG 403 ở GET. */
  @Get(':id')
  @ApiOkResponse({ type: TaskResponse })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskResponse> {
    return toResponse(await this.getTask.execute(id, scopeTeamId));
  }

  /** Sửa định nghĩa — owner-only (§3.1). Thành công → 200 + TaskResponse cập nhật. */
  @Patch(':id')
  @ApiOkResponse({ type: TaskResponse })
  async edit(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskResponse> {
    return toResponse(
      await this.editDefinition.execute({
        id,
        userId,
        scopeTeamId,
        input: {
          title: dto.title,
          description: dto.description,
          deadline: parseDeadline(dto.deadline),
          allowPastDeadline: dto.allowPastDeadline,
        },
      }),
    );
  }

  /** Đổi tiến độ — assignee-only (§3.1). */
  @Patch(':id/progress')
  @ApiOkResponse({ type: TaskResponse })
  async progress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskResponse> {
    return toResponse(
      await this.updateProgress.execute({
        id,
        userId,
        scopeTeamId,
        progress: dto.progress,
      }),
    );
  }

  /** Đổi người được giao — leader-only (§3.1). */
  @Patch(':id/assignee')
  @ApiOkResponse({ type: TaskResponse })
  async reassign(
    @Param('id') id: string,
    @Body() dto: ReassignDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<TaskResponse> {
    return toResponse(
      await this.reassignTask.execute({
        id,
        role,
        scopeTeamId,
        newAssigneeId: dto.assigneeId,
      }),
    );
  }

  /** Xoá mềm — owner-only (§3.1/§10). Trả 204. */
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('teamId') scopeTeamId: string | null,
  ): Promise<void> {
    await this.deleteTask.execute(id, userId, scopeTeamId);
  }
}

/** TaskView → TaskResponse (cổng 2): spread Task + overdue → projection whitelist loại field cấm. */
function toResponse(v: TaskView): TaskResponse {
  return toTaskResponse({ ...v.task, overdue: v.overdue });
}

/** absent → undefined (giữ nguyên); null → null (xoá deadline); ISO string → Date. */
function parseDeadline(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}
