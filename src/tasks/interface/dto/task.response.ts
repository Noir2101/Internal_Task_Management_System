import { ApiProperty } from '@nestjs/swagger';
import { Progress } from '@prisma/client';
import { Expose, Type } from 'class-transformer';
import { project } from '../../../common/projection';

/** owner/assignee — projection lồng CHỈ {id,name} (docs/06 §8.2), không nhả toàn bộ user. */
class UserBrief {
  @ApiProperty({ example: 'ckx0owner1a2b3c4d5e6f7g8h' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Bích' })
  @Expose()
  name: string;
}

/**
 * Phép chiếu Task ra response (docs/06 §8.2) — cổng 2 default-deny: CHỈ field `@Expose` lộ ra.
 * KHÔNG bao giờ lộ `assigneeTeamId` (scope suy ra), `deletedAt`, `ownerId/assigneeId` thô, hay
 * `passwordHash` của user lồng. `overdue` là COMPUTED (use-case gắn trước khi map).
 * Date đi qua nguyên dạng → Nest serialize JSON thành ISO-8601 UTC (docs/06 §1).
 */
export class TaskResponse {
  @ApiProperty({ example: 'ckx0task01a2b3c4d5e6f7g8h' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Migration prod' })
  @Expose()
  title: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Chạy migration trên DB production',
  })
  @Expose()
  description: string | null;

  @ApiProperty({ enum: Progress, example: Progress.IN_PROGRESS })
  @Expose()
  progress: Progress;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'ISO-8601 UTC, có thể null',
    example: '2026-06-22T17:00:00.000Z',
  })
  @Expose()
  deadline: string | null;

  @ApiProperty({
    description:
      'Computed: deadline < now AND progress != DONE (KHÔNG phải progress)',
    example: true,
  })
  @Expose()
  overdue: boolean;

  @ApiProperty({
    type: UserBrief,
    example: { id: 'ckx0owner1a2b3c4d5e6f7g8h', name: 'Bích' },
  })
  @Expose()
  @Type(() => UserBrief)
  owner: UserBrief;

  @ApiProperty({
    type: UserBrief,
    example: { id: 'ckx0assignee2b3c4d5e6f7g8', name: 'Bảo' },
  })
  @Expose()
  @Type(() => UserBrief)
  assignee: UserBrief;

  @ApiProperty({ example: '2026-06-18T09:00:00.000Z' })
  @Expose()
  createdAt: string;

  @ApiProperty({ example: '2026-06-20T14:30:00.000Z' })
  @Expose()
  updatedAt: string;
}

/** Map qua cổng 2: serialize thẳng model Prisma/domain bị chặn (field cấm không bao giờ lọt). */
export const toTaskResponse = (src: unknown): TaskResponse =>
  project(TaskResponse, src);
