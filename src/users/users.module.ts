import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule (thin). Inject PrismaService (global) trực tiếp — KHÔNG port. `imports: [TasksModule]`
 * để dùng artifact Tasks ở deactivate: `TASK_QUERY_PORT` (countByAssignee) + `NOTIFIER`
 * (notifyTasksOrphaned) — TasksModule export sẵn hai token này. Chiều phụ thuộc Users→Tasks (build-plan §1).
 */
@Module({
  imports: [TasksModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
