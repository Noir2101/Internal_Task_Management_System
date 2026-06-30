import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { project } from '../../common/projection';

/** assignee — projection lồng CHỈ {id,name} (docs/06 §5/§8.2), không nhả toàn bộ user. */
class UserBrief {
  @ApiProperty({ example: 'ckx0assignee2b3c4d5e6f7g8' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'An' })
  @Expose()
  name: string;
}

/**
 * Phân bố tiến độ — ĐÚNG 3 key (docs/06 §5). Cổng 2 default-deny: CHỈ TODO/IN_PROGRESS/DONE lộ ra ⇒
 * một bucket lạ (vd `OVERDUE`) lọt vào src cũng bị loại ⇒ KHÔNG có bucket OVERDUE thứ tư ngang hàng.
 */
class ProgressBreakdown {
  @ApiProperty({ example: 2 })
  @Expose()
  TODO: number;

  @ApiProperty({ example: 2 })
  @Expose()
  IN_PROGRESS: number;

  @ApiProperty({ example: 2 })
  @Expose()
  DONE: number;
}

/** Phạm vi suy ra từ JWT (docs/06 §5) — leader chỉ thấy nhóm mình. */
class ScopeInfo {
  @ApiProperty({ example: 'ckx0team01a2b3c4d5e6f7g8h' })
  @Expose()
  teamId: string;

  @ApiProperty({ example: 'Backend' })
  @Expose()
  teamName: string;
}

/** Một dòng phân rã theo người phụ trách (outer-join — member rảnh vẫn hiện với toàn 0). */
class AssigneeStat {
  @ApiProperty({
    type: UserBrief,
    example: { id: 'ckx0assignee2b3c4d5e6f7g8', name: 'An' },
  })
  @Expose()
  @Type(() => UserBrief)
  assignee: UserBrief;

  @ApiProperty({
    type: ProgressBreakdown,
    example: { TODO: 1, IN_PROGRESS: 1, DONE: 1 },
  })
  @Expose()
  @Type(() => ProgressBreakdown)
  byProgress: ProgressBreakdown;

  @ApiProperty({ example: 1 })
  @Expose()
  overdue: number;
}

/**
 * Phép chiếu Stats ra response (docs/06 §5) — cổng 2 default-deny: CHỈ field `@Expose` lộ ra.
 * Hình dạng ÉP CỨNG 3 bất biến OVERDUE: `byProgress` đúng 3 key (KHÔNG bucket thứ tư); `overdue` là
 * SIBLING của `byProgress` (không đếm trùng); `total` = tổng byProgress, `overdue` NẰM NGOÀI total.
 * Nested `assignee` chỉ {id,name} — KHÔNG serialize toàn bộ user.
 */
export class StatsResponse {
  @ApiProperty({
    type: ScopeInfo,
    example: { teamId: 'ckx0team01a2b3c4d5e6f7g8h', teamName: 'Backend' },
  })
  @Expose()
  @Type(() => ScopeInfo)
  scope: ScopeInfo;

  @ApiProperty({
    description: '= tổng byProgress (= tổng các số trong byAssignee)',
    example: 6,
  })
  @Expose()
  total: number;

  @ApiProperty({
    type: ProgressBreakdown,
    example: { TODO: 2, IN_PROGRESS: 2, DONE: 2 },
  })
  @Expose()
  @Type(() => ProgressBreakdown)
  byProgress: ProgressBreakdown;

  @ApiProperty({
    description:
      'Lát cắt OVERDUE — sibling của byProgress, NẰM NGOÀI total (DONE-quá-hạn không tính)',
    example: 2,
  })
  @Expose()
  overdue: number;

  @ApiProperty({
    type: [AssigneeStat],
    example: [
      {
        assignee: { id: 'ckx0assignee2b3c4d5e6f7g8', name: 'An' },
        byProgress: { TODO: 1, IN_PROGRESS: 1, DONE: 1 },
        overdue: 1,
      },
      {
        assignee: { id: 'ckx0assignee3c4d5e6f7g8h9', name: 'Bảo' },
        byProgress: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
        overdue: 0,
      },
    ],
  })
  @Expose()
  @Type(() => AssigneeStat)
  byAssignee: AssigneeStat[];
}

/** Map qua cổng 2: field cấm không bao giờ lọt; byProgress chỉ giữ đúng 3 key đã `@Expose`. */
export const toStatsResponse = (src: unknown): StatsResponse =>
  project(StatsResponse, src);
