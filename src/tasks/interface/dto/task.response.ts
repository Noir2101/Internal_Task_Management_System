import { ApiProperty } from '@nestjs/swagger';
import { Progress } from '@prisma/client';
import { Expose, Type } from 'class-transformer';
import { project } from '../../../common/projection';

/** owner/assignee — projection lồng CHỈ {id,name} (docs/06 §8.2), không nhả toàn bộ user. */
class UserBrief {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
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
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty({ nullable: true, type: String })
  @Expose()
  description: string | null;

  @ApiProperty({ enum: Progress })
  @Expose()
  progress: Progress;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'ISO-8601 UTC, có thể null',
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

  @ApiProperty({ type: UserBrief })
  @Expose()
  @Type(() => UserBrief)
  owner: UserBrief;

  @ApiProperty({ type: UserBrief })
  @Expose()
  @Type(() => UserBrief)
  assignee: UserBrief;

  @ApiProperty()
  @Expose()
  createdAt: string;

  @ApiProperty()
  @Expose()
  updatedAt: string;
}

/** Map qua cổng 2: serialize thẳng model Prisma/domain bị chặn (field cấm không bao giờ lọt). */
export const toTaskResponse = (src: unknown): TaskResponse =>
  project(TaskResponse, src);
