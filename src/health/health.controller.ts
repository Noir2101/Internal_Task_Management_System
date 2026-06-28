import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/authz/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health check chạm DB. Ngoài contract surface (docs/06) — là endpoint hạ tầng.
 * DB sống → 200 { status: 'ok' }; DB lỗi → ném → filter trả 500 INTERNAL_ERROR + requestId.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public() // health ngoài contract surface (docs/06) — không cần Bearer
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  async check(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
