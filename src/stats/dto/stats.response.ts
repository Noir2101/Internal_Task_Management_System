import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { project } from '../../common/projection';

/** assignee — projection lồng CHỈ {id,name} (docs/06 §5/§8.2), không nhả toàn bộ user. */
class UserBrief {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}

/**
 * Phân bố tiến độ — ĐÚNG 3 key (docs/06 §5). Cổng 2 default-deny: CHỈ TODO/IN_PROGRESS/DONE lộ ra ⇒
 * một bucket lạ (vd `OVERDUE`) lọt vào src cũng bị loại ⇒ KHÔNG có bucket OVERDUE thứ tư ngang hàng.
 */
class ProgressBreakdown {
  @ApiProperty()
  @Expose()
  TODO: number;

  @ApiProperty()
  @Expose()
  IN_PROGRESS: number;

  @ApiProperty()
  @Expose()
  DONE: number;
}

/** Phạm vi suy ra từ JWT (docs/06 §5) — leader chỉ thấy nhóm mình. */
class ScopeInfo {
  @ApiProperty()
  @Expose()
  teamId: string;

  @ApiProperty()
  @Expose()
  teamName: string;
}

/** Một dòng phân rã theo người phụ trách (outer-join — member rảnh vẫn hiện với toàn 0). */
class AssigneeStat {
  @ApiProperty({ type: UserBrief })
  @Expose()
  @Type(() => UserBrief)
  assignee: UserBrief;

  @ApiProperty({ type: ProgressBreakdown })
  @Expose()
  @Type(() => ProgressBreakdown)
  byProgress: ProgressBreakdown;

  @ApiProperty()
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
  @ApiProperty({ type: ScopeInfo })
  @Expose()
  @Type(() => ScopeInfo)
  scope: ScopeInfo;

  @ApiProperty({
    description: '= tổng byProgress (= tổng các số trong byAssignee)',
  })
  @Expose()
  total: number;

  @ApiProperty({ type: ProgressBreakdown })
  @Expose()
  @Type(() => ProgressBreakdown)
  byProgress: ProgressBreakdown;

  @ApiProperty({
    description:
      'Lát cắt OVERDUE — sibling của byProgress, NẰM NGOÀI total (DONE-quá-hạn không tính)',
  })
  @Expose()
  overdue: number;

  @ApiProperty({ type: [AssigneeStat] })
  @Expose()
  @Type(() => AssigneeStat)
  byAssignee: AssigneeStat[];
}

/** Map qua cổng 2: field cấm không bao giờ lọt; byProgress chỉ giữ đúng 3 key đã `@Expose`. */
export const toStatsResponse = (src: unknown): StatsResponse =>
  project(StatsResponse, src);
