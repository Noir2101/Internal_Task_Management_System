import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/authz/public.decorator';
import {
  TokenExpiredException,
  TokenInvalidException,
} from './auth.exceptions';
import { AccessClaims } from './auth.types';

/**
 * Guard xác thực bằng access token (docs/06 §6.4). Đăng ký GLOBAL (APP_GUARD) → mọi endpoint
 * mặc-định-bảo-vệ; opt-out bằng `@Public()` (login/refresh/logout/health). Đọc `Authorization:
 * Bearer`, verify chữ ký + hạn, gắn `req.user = {sub,role,teamId}` cho handler.
 * Map lỗi CHÍNH XÁC vào registry §7.3 (passport ném 401 generic không làm được điều này,
 * lại rơi vào nhánh 500 của filter): hết hạn → TOKEN_EXPIRED, còn lại → TOKEN_INVALID.
 * Chạy TRƯỚC RolesGuard (đăng ký sau) nên RolesGuard luôn thấy `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req);
    if (!token) throw new TokenInvalidException();

    try {
      const payload = await this.jwt.verifyAsync<
        AccessClaims & { iat: number; exp: number }
      >(token);
      req.user = {
        sub: payload.sub,
        role: payload.role,
        teamId: payload.teamId,
      };
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw new TokenExpiredException();
      }
      throw new TokenInvalidException();
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
