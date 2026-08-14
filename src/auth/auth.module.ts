import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { resolveThrottlerStorage } from './throttler-storage';

/**
 * Auth (thin). JwtModule wire secret + TTL access từ ConfigService (ConfigModule @Global ở Bước 1).
 * `getOrThrow` cho JWT_ACCESS_SECRET → fail-fast nếu thiếu cấu hình (không chạy với secret rỗng).
 * Refresh token là opaque random (không secret) nên không cấu hình gì thêm cho nó ở đây.
 *
 * `JwtAuthGuard` đăng ký APP_GUARD ở đây (JwtModule có sẵn → resolve JwtService) ⇒ áp GLOBAL:
 * mọi endpoint mặc-định-bảo-vệ, opt-out bằng `@Public()`. RolesGuard (common/) apply per-controller
 * ở Bước 4–6, chạy sau guard global này.
 *
 * `ThrottlerModule` (Bước 7, §6.4) cấp dep cho `ThrottlerGuard`. KHÔNG đăng ký guard này
 * APP_GUARD (toàn cục) — chỉ `@UseGuards(ThrottlerGuard)` per-method ở `/auth/login` + `/auth/refresh`
 * (ttl=60000ms; limit override per-route). Stats/Tasks/Users/Teams KHÔNG bị siết.
 *
 * GĐ11 slice 1: `forRoot` → `forRootAsync` CHỈ để bơm được `storage` theo env (docs/11 §2). Giới hạn,
 * `skipIf` và mã lỗi 429 `RATE_LIMITED` giữ nguyên xi — đây là đổi CHỖ ĐẶT counter, không đổi hợp đồng.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // ConfigModule là @Global (Bước 1) → không cần khai `imports` ở đây.
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 10 }],
        skipIf: () => process.env.THROTTLE_DISABLED === 'true',
        // Thiếu REDIS_URL ⇒ undefined ⇒ in-memory (dev/test). Có ⇒ counter chung mọi replica.
        storage: resolveThrottlerStorage(config.get<string>('REDIS_URL')),
      }),
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        ({
          secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          // `expiresIn` muốn kiểu StringValue của `ms` (vd '15m'); env là string → assert.
          signOptions: {
            expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m',
          },
        }) as JwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
