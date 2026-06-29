import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/**
 * TeamsModule (thin). Inject PrismaService (global) trực tiếp — KHÔNG port. KHÔNG phụ thuộc Tasks
 * (chỉ Users cần artifact Tasks cho deactivate). RolesGuard apply per-controller (common/).
 */
@Module({
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
