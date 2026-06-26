import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import {
  TokenExpiredException,
  TokenInvalidException,
} from './auth.exceptions';
import { AccessClaims } from './auth.types';

/**
 * Guard xác thực bằng access token (docs/06 §6.4). Đọc `Authorization: Bearer`,
 * verify chữ ký + hạn, gắn `req.user = {sub,role,teamId}` cho handler.
 * Map lỗi CHÍNH XÁC vào registry §7.3 (passport ném 401 generic không làm được điều này,
 * lại rơi vào nhánh 500 của filter): hết hạn → TOKEN_EXPIRED, còn lại → TOKEN_INVALID.
 * (RolesGuard/@CurrentUser là Bước 3 — đây chỉ là xác thực, chưa phân quyền vai trò.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
