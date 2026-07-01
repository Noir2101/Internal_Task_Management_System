import { Injectable, Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignedEvent,
  Notifier,
  ReassignedEvent,
  TasksOrphanedEvent,
} from '../application/ports/notifier.port';

/**
 * EmailNotifier — hiện thực `Notifier` bằng nodemailer SMTP (provider prod = Resend). Adapter ĐƯỢC
 * chạm Prisma (cổng 1 chỉ cấm domain/application) để RESOLVE recipient: event mang ID, adapter tra
 * email qua Prisma. Email KHÔNG lộ ra response — adapter không trả gì FE quan sát được.
 *
 * Failure policy: MỌI method bọc try/catch, log lỗi, KHÔNG BAO GIỜ reject. Gửi email là side-effect
 * KHÔNG-ĐƯỢC-vỡ-task-write; bảo đảm "không reject" này che CẢ ReassignTask và Users.deactivate
 * (vốn `await` notifier mà không tự try/catch). Bài học Bước 2/5: side-effect cần-commit tách khỏi
 * đường-ném-lỗi của use-case.
 */
@Injectable()
export class EmailNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');

  constructor(
    private readonly prisma: PrismaService,
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  /** CreateTask → báo assignee mới (chỉ phát khi giao cho người khác, gate ở use-case). */
  async notifyAssigned(event: AssignedEvent): Promise<void> {
    try {
      const [assignee, task, owner] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: event.assigneeId },
          select: { email: true, name: true },
        }),
        this.prisma.task.findUnique({
          where: { id: event.taskId },
          select: { title: true, deadline: true },
        }),
        this.prisma.user.findUnique({
          where: { id: event.ownerId },
          select: { name: true },
        }),
      ]);
      if (!assignee || !task) return;

      await this.send(
        assignee.email,
        `Bạn được giao task: ${task.title}`,
        this.assignBody(
          assignee.name,
          task.title,
          task.deadline,
          owner?.name ?? 'một người dùng',
        ),
      );
    } catch (err) {
      this.logFailure('notifyAssigned', event.taskId, err);
    }
  }

  /** ReassignTask → báo assignee mới (§9.3 "báo assignee mới"). */
  async notifyReassigned(event: ReassignedEvent): Promise<void> {
    try {
      const [assignee, task] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: event.newAssigneeId },
          select: { email: true, name: true },
        }),
        this.prisma.task.findUnique({
          where: { id: event.taskId },
          select: { title: true, deadline: true },
        }),
      ]);
      if (!assignee || !task) return;

      await this.send(
        assignee.email,
        `Task được giao lại cho bạn: ${task.title}`,
        this.assignBody(
          assignee.name,
          task.title,
          task.deadline,
          'leader nhóm',
        ),
      );
    } catch (err) {
      this.logFailure('notifyReassigned', event.taskId, err);
    }
  }

  /** Users.deactivate → báo LEADER của nhóm đi giao lại task treo (resolve leader + tên member qua Prisma). */
  async notifyTasksOrphaned(event: TasksOrphanedEvent): Promise<void> {
    try {
      const [leader, member] = await Promise.all([
        this.prisma.user.findFirst({
          where: { teamId: event.teamId, role: 'LEADER', isActive: true },
          select: { email: true, name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: event.deactivatedUserId },
          select: { name: true },
        }),
      ]);
      if (!leader) {
        this.logger.warn(
          `notifyTasksOrphaned: team ${event.teamId} không có leader đang hoạt động — bỏ qua email.`,
        );
        return;
      }

      await this.send(
        leader.email,
        `Có ${event.orphanedTaskCount} task treo cần giao lại`,
        this.orphanedBody(
          leader.name,
          member?.name ?? 'Một thành viên',
          event.orphanedTaskCount,
        ),
      );
    } catch (err) {
      this.logFailure('notifyTasksOrphaned', event.teamId, err);
    }
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }

  private assignBody(
    name: string,
    title: string,
    deadline: Date | null,
    byWhom: string,
  ): string {
    const dueLine = deadline
      ? `Hạn chót: ${deadline.toISOString()}`
      : 'Hạn chót: không có';
    return [
      `Chào ${name},`,
      '',
      `Bạn vừa được ${byWhom} giao một task:`,
      `- Tiêu đề: ${title}`,
      `- ${dueLine}`,
      '',
      'Đăng nhập ITMS để xem chi tiết.',
    ].join('\n');
  }

  private orphanedBody(
    leaderName: string,
    memberName: string,
    count: number,
  ): string {
    return [
      `Chào ${leaderName},`,
      '',
      `${memberName} vừa bị vô hiệu hoá và còn ${count} task chưa hoàn thành trong nhóm của bạn.`,
      'Vui lòng đăng nhập ITMS để giao lại các task này cho thành viên khác trong nhóm.',
    ].join('\n');
  }

  private logFailure(hook: string, target: string, err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `Gửi email thất bại ở ${hook} (target=${target}): ${reason}`,
    );
  }
}
