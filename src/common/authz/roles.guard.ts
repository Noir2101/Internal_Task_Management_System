import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ForbiddenError, NotFoundError } from '../exceptions/domain.exception';
import { ROLES_KEY, RolesMeta } from './roles.decorator';

/**
 * Guard vai trò ở rìa HTTP (docs/06 §3 keystone). Chạy SAU `JwtAuthGuard` (global APP_GUARD đăng ký
 * trước) nên `req.user` đã có. Đọc metadata `@Roles`; không có → endpoint không gác role, cho qua.
 *
 * Role sai → rẽ theo `onDeny` (đã chốt split keystone):
 *   - `hide`   → NotFoundError  → filter → 404 RESOURCE_NOT_FOUND (giấu tồn tại; vd /users,/teams).
 *   - `forbid` → ForbiddenError → filter → 403 + code            (thấy được nhưng sai vai; vd /stats).
 *
 * KHÔNG chứa record-level/one-law-per-endpoint — cái đó thuộc Tasks (Bước 4).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<RolesMeta | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    // Phòng thủ: req.user thiếu nghĩa là xác thực CHƯA chạy trên route này (vd lỡ gắn @Public,
    // hoặc compose guard sai). Đây là lỗi cấu hình server, không phải lỗi client → để filter trả
    // 500. Giữ common/ KHÔNG phụ thuộc auth/ (chiều phụ thuộc xuôi).
    if (!user) {
      throw new Error(
        'RolesGuard chạy mà req.user trống — xác thực chưa chạy trước RolesGuard (sai compose guard).',
      );
    }

    if (meta.roles.includes(user.role)) return true;

    if (meta.onDeny.kind === 'hide') throw new NotFoundError();
    throw new ForbiddenError(
      meta.onDeny.code,
      'Bạn không có quyền thực hiện hành động này.',
    );
  }
}
