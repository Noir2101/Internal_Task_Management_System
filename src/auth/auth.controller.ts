import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/authz/public.decorator';
import { AuthService } from './auth.service';
import { AuthUserResponse } from './dto/auth-user.response';
import { LoginDto } from './dto/login.dto';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

/**
 * Auth endpoints (docs/06 §6). Cookie ở rìa: controller đọc/set/xoá refresh cookie;
 * AuthService giữ luật + token store (express-free, dễ test ở GĐ8).
 * `@Res({ passthrough: true })` → set cookie mà Nest vẫn serialize giá trị trả về.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200) // §6.2: login trả 200 (không phải 201 mặc định của POST)
  @UseGuards(ThrottlerGuard) // §6.4: throttle CHỈ ở login/refresh (per-method, không toàn cục)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // ~5 lần/phút/IP — chống dò mật khẩu
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: AuthUserResponse }> {
    const { accessToken, refresh, user } = await this.auth.login(
      dto.email,
      dto.password,
    );
    setRefreshCookie(res, refresh.raw, refresh.expiresAt);
    return { accessToken, user };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200) // §6.2: refresh trả 200 (không phải 201 mặc định của POST)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // ~10 lần/phút
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    try {
      const { accessToken, refresh } = await this.auth.refresh(
        readRefreshCookie(req),
      );
      setRefreshCookie(res, refresh.raw, refresh.expiresAt);
      return { accessToken };
    } catch (err) {
      // Mọi ca lỗi refresh (gồm reuse) → xoá cookie (§6.2) rồi để filter dựng envelope.
      clearRefreshCookie(res);
      throw err;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
  }

  @Get('me')
  @ApiBearerAuth()
  async me(@Req() req: Request): Promise<{ user: AuthUserResponse }> {
    // Không @Public → global JwtAuthGuard đã chặn nếu thiếu/hỏng token và gắn req.user.
    const user = await this.auth.me(req.user!.sub);
    return { user };
  }
}
