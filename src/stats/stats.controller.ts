import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/authz/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { StatsResponse, toStatsResponse } from './dto/stats.response';
import { StatsService } from './stats.service';

/**
 * Stats dashboard (docs/06 §5). Leader-only Ở RÌA: `@Roles(['LEADER'], forbid INSUFFICIENT_ROLE)` →
 * member + admin đều 403 (member THẤY ĐƯỢC nhóm qua /tasks; admin biết endpoint qua contract ⇒ 403
 * không lộ thêm, KHÔNG giấu→404). scope = teamId trong JWT (leader luôn có teamId; KHÔNG nhận param
 * teamId từ client). Response qua `toStatsResponse` (cổng 2 default-deny).
 *
 * `'LEADER'` literal (không `Role.LEADER`): cổng 1 ESLint cấm `@prisma/client` trong stats/** — chuỗi
 * vẫn type-check vì `Role = 'ADMIN'|'LEADER'|'MEMBER'` (sai chính tả ⇒ lỗi compile).
 */
@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @Roles(['LEADER'], { kind: 'forbid', code: 'INSUFFICIENT_ROLE' })
  @ApiOperation({ summary: 'Dashboard số liệu nhóm (leader)' })
  @ApiOkResponse({ type: StatsResponse })
  async getStats(
    // RolesGuard(['LEADER']) đảm bảo non-null — admin (teamId=null) đã bị chặn 403 ở rìa.
    @CurrentUser('teamId') scopeTeamId: string,
  ): Promise<StatsResponse> {
    return toStatsResponse(await this.stats.getTeamStats(scopeTeamId));
  }
}
