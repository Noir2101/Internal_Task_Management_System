import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Auth (thin). JwtModule wire secret + TTL access từ ConfigService (ConfigModule @Global ở Bước 1).
 * `getOrThrow` cho JWT_ACCESS_SECRET → fail-fast nếu thiếu cấu hình (không chạy với secret rỗng).
 * Refresh token là opaque random (không secret) nên không cấu hình gì thêm cho nó ở đây.
 *
 * `JwtAuthGuard` đăng ký APP_GUARD ở đây (JwtModule có sẵn → resolve JwtService) ⇒ áp GLOBAL:
 * mọi endpoint mặc-định-bảo-vệ, opt-out bằng `@Public()`. RolesGuard (common/) apply per-controller
 * ở Bước 4–6, chạy sau guard global này.
 *
 * `ThrottlerModule.forRoot` (Bước 7, §6.4) cấp dep cho `ThrottlerGuard`. KHÔNG đăng ký guard này
 * APP_GUARD (toàn cục) — chỉ `@UseGuards(ThrottlerGuard)` per-method ở `/auth/login` + `/auth/refresh`
 * (ttl=60000ms; limit override per-route). Stats/Tasks/Users/Teams KHÔNG bị siết.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
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
