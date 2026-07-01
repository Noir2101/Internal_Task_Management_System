import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
}

/** Prefix tĩnh — mọi request e2e nối vào path này. */
export const PREFIX = '/api/v1';

/** Guard pass-through thay ThrottlerGuard: lưới e2e không dính 429 giả khi login/refresh nhiều lần. */
const passThroughGuard = { canActivate: (): boolean => true };

/**
 * Dựng app Nest thật từ AppModule + configureApp() (CÙNG pipeline prod) cho supertest. Chỉ khác prod
 * ở chỗ vô hiệu ThrottlerGuard (429 verify bằng smoke tay — docs/08). Notifier = NoopNotifier vì
 * MAIL_ENABLED bị xoá ở env.ts.
 */
export async function buildTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue(passThroughGuard)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}
