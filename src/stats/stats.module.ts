import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/**
 * StatsModule (thin). `imports: [TasksModule]` để inject `TASK_QUERY_PORT` (TasksModule export sẵn) —
 * ISP: Stats CHỈ thấy port đọc, KHÔNG thấy write port. KHÔNG port riêng, KHÔNG Prisma (cổng 1), KHÔNG
 * phụ thuộc module Users/Teams (outer-join member nằm TRONG adapter Tasks). CLOCK (global) tự inject.
 */
@Module({
  imports: [TasksModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
