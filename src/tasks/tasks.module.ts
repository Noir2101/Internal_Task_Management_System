import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTask } from './application/create-task.usecase';
import { DeleteTask } from './application/delete-task.usecase';
import { EditDefinition } from './application/edit-definition.usecase';
import { GetTask } from './application/get-task.usecase';
import { ListTasks } from './application/list-tasks.usecase';
import { NOTIFIER, type Notifier } from './application/ports/notifier.port';
import { TASK_QUERY_PORT } from './application/ports/task-query.port';
import { TASK_WRITE_PORT } from './application/ports/task-write.port';
import { ReassignTask } from './application/reassign-task.usecase';
import { UpdateProgress } from './application/update-progress.usecase';
import { EmailNotifier } from './infrastructure/email-notifier';
import { createSmtpTransport } from './infrastructure/mail-transport';
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
    // NOTIFIER chọn theo env: MAIL_ENABLED=true → EmailNotifier (nodemailer SMTP, fail-fast nếu
    // thiếu SMTP_*/MAIL_FROM); còn lại → NoopNotifier (mặc-định-offline: unit/CI/dev không chạm mạng).
    {
      provide: NOTIFIER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService): Notifier =>
        config.get<string>('MAIL_ENABLED') === 'true'
          ? new EmailNotifier(
              prisma,
              createSmtpTransport(config),
              config.get<string>('MAIL_FROM')!,
            )
          : new NoopNotifier(),
    },
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
