import { Module } from '@nestjs/common';
import { CreateTask } from './application/create-task.usecase';
import { DeleteTask } from './application/delete-task.usecase';
import { EditDefinition } from './application/edit-definition.usecase';
import { GetTask } from './application/get-task.usecase';
import { ListTasks } from './application/list-tasks.usecase';
import { NOTIFIER } from './application/ports/notifier.port';
import { TASK_QUERY_PORT } from './application/ports/task-query.port';
import { TASK_WRITE_PORT } from './application/ports/task-write.port';
import { ReassignTask } from './application/reassign-task.usecase';
import { UpdateProgress } from './application/update-progress.usecase';
import { NoopNotifier } from './infrastructure/noop-notifier';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import { TasksController } from './interface/tasks.controller';

/**
 * TasksModule (deep hexagonal). DIP CHỈ ở đây: use-case phụ thuộc PORT qua token; adapter Prisma
 * hiện thực CẢ hai port (bind qua `useExisting` → một instance dùng chung).
 * ISP: `TASK_QUERY_PORT` export ra cho Bước 6 (Stats chỉ thấy port đọc), `TASK_WRITE_PORT` nội bộ.
 * PrismaService (global) + CLOCK (global) tự inject, không cần import module.
 */
@Module({
  controllers: [TasksController],
  providers: [
    PrismaTaskRepository,
    { provide: TASK_WRITE_PORT, useExisting: PrismaTaskRepository },
    { provide: TASK_QUERY_PORT, useExisting: PrismaTaskRepository },
    { provide: NOTIFIER, useClass: NoopNotifier },
    CreateTask,
    ListTasks,
    GetTask,
    EditDefinition,
    UpdateProgress,
    ReassignTask,
    DeleteTask,
  ],
  exports: [TASK_QUERY_PORT],
})
export class TasksModule {}
