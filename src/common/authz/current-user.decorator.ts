import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AccessClaims } from '../auth-claims';

/**
 * Trích claims đã xác thực từ `req.user` (gắn bởi `JwtAuthGuard`). Chạy SAU xác thực, nên
 * trên endpoint được bảo vệ `req.user` luôn có.
 *
 *   @CurrentUser()      claims: AccessClaims     — cả object
 *   @CurrentUser('sub') sub: AccessClaims['sub'] — một field
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AccessClaims | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    return data ? user?.[data] : user;
  },
);
