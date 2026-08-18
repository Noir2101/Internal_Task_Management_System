import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTask } from './application/create-task.usecase';
import { DeleteTask } from './application/delete-task.usecase';
import { EditDefinition } from './application/edit-definition.usecase';
import { GetTask } from './application/get-task.usecase';
import { ListTasks } from './application/list-tasks.usecase';
import { NOTIFIER, type Notifier } from './application/ports/notifier.port';
import {
  TASK_QUERY_PORT,
  type TaskQueryPort,
} from './application/ports/task-query.port';
import { TASK_WRITE_PORT } from './application/ports/task-write.port';
import { ReassignTask } from './application/reassign-task.usecase';
import { UpdateProgress } from './application/update-progress.usecase';
import {
  DIRECT_NOTIFIER,
  createDirectNotifier,
} from './infrastructure/direct-notifier';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import {
  isNotificationQueueEnabled,
  notificationQueueImports,
  notificationQueueProviders,
} from './infrastructure/queue/notification-queue';
import { NOTIFICATION_QUEUE } from './infrastructure/queue/notification-queue.constants';
import { QueuedNotifier } from './infrastructure/queue/queued-notifier';
import { TasksController } from './interface/tasks.controller';

/**
 * Đọc `REDIS_URL` ở thời điểm dựng METADATA, không phải lúc chạy — xem `notification-queue.ts` để
 * biết vì sao BullMQ không cho hoãn quyết định này sang runtime.
 *
 * Thời điểm đó nằm TRƯỚC khi `ConfigModule.forRoot()` của `app.module.ts` chạy dotenv, nên `main.ts`
 * nạp `dotenv/config` ngay dòng đầu để `.env` cũng có hiệu lực ở đây. Lưới e2e không dựa vào thứ tự
 * đó: `test/setup/env.ts` ép `REDIS_URL` thành chuỗi rỗng.
 */
const redisUrl = process.env.REDIS_URL;

/**
 * TasksModule (deep hexagonal). DIP CHỈ ở đây: use-case phụ thuộc PORT qua token; adapter Prisma
 * hiện thực CẢ hai port (bind qua `useExisting` → một instance dùng chung).
 * ISP: `TASK_QUERY_PORT` export ra cho Bước 6 (Stats chỉ thấy port đọc), `TASK_WRITE_PORT` nội bộ.
 * PrismaService (global) + CLOCK (global) tự inject, không cần import module.
 *
 * GĐ11 slice 2 (docs/11 §6): có `REDIS_URL` thì thêm hạ tầng queue và `NOTIFIER` thành `QueuedNotifier`;
 * không có thì hai mảng dưới đây rỗng và mọi thứ chạy y như trước slice này.
 */
@Module({
  imports: [...notificationQueueImports(redisUrl)],
  controllers: [TasksController],
  providers: [
    PrismaTaskRepository,
    { provide: TASK_WRITE_PORT, useExisting: PrismaTaskRepository },
    { provide: TASK_QUERY_PORT, useExisting: PrismaTaskRepository },
    // Adapter gửi thật, chọn theo env MAIL_ENABLED (docs/07.A §6). Khi queue bật thì người tiêu thụ
    // duy nhất của nó là worker; khi tắt thì `NOTIFIER` bind thẳng vào đây.
    {
      provide: DIRECT_NOTIFIER,
      inject: [ConfigService, PrismaService, TASK_QUERY_PORT],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        query: TaskQueryPort,
      ): Notifier =>
        createDirectNotifier(config, prisma, query, {
          rethrow: isNotificationQueueEnabled(redisUrl),
        }),
    },
    // Seam mà use-case nhìn thấy. Có queue thì việc gửi rời khỏi đường request; không thì giữ nguyên
    // hành vi cũ. Không use-case nào phải biết mình đang ở thế giới nào.
    isNotificationQueueEnabled(redisUrl)
      ? {
          provide: NOTIFIER,
          inject: [getQueueToken(NOTIFICATION_QUEUE)],
          useFactory: (queue: Queue): Notifier => new QueuedNotifier(queue),
        }
      : { provide: NOTIFIER, useExisting: DIRECT_NOTIFIER },
    ...notificationQueueProviders(redisUrl),
    CreateTask,
    ListTasks,
    GetTask,
    EditDefinition,
    UpdateProgress,
    ReassignTask,
    DeleteTask,
  ],
  // TASK_QUERY_PORT: Stats (Bước 6) đọc read-model + Users (Bước 5) đếm task treo (countByAssignee).
  // NOTIFIER: Users (Bước 5) phát notifyTasksOrphaned khi deactivate — tiêu thụ port của Tasks.
  exports: [TASK_QUERY_PORT, NOTIFIER],
})
export class TasksModule {}
