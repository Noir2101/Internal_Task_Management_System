import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Auth (thin). JwtModule wire secret + TTL access từ ConfigService (ConfigModule @Global ở Bước 1).
 * `getOrThrow` cho JWT_ACCESS_SECRET → fail-fast nếu thiếu cấu hình (không chạy với secret rỗng).
 * Refresh token là opaque random (không secret) nên không cấu hình gì thêm cho nó ở đây.
 */
@Module({
  imports: [
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
  providers: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
