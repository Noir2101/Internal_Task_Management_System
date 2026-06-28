import { Role } from '@prisma/client';

/**
 * Claims trong access token (docs/06 §6.4). `sub`/`role`/`teamId` để guard vai trò chạy
 * mà không truy DB; record-level vẫn truy DB. `teamId` null cho admin (ngoài cây tổ chức).
 * `iat`/`exp` do `@nestjs/jwt` (jsonwebtoken) tự gắn khi sign.
 *
 * Đặt ở `common/` (tầng nền) vì `@CurrentUser`/`RolesGuard` ở đây tiêu thụ nó; auth re-export
 * type này để không vỡ import cũ. Import `Role` từ Prisma được phép ở common (cổng 1 chỉ chặn
 * `tasks/domain/**` và `stats/**`).
 */
export interface AccessClaims {
  sub: string;
  role: Role;
  teamId: string | null;
}
