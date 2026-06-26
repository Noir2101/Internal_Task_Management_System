import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Load .env vào process.env lúc runtime (Prisma Client không tự đọc .env).
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
