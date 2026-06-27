import { Role } from '@prisma/client';

/**
 * Claims trong access token (docs/06 §6.4). `sub`/`role`/`teamId` để guard vai trò chạy
 * mà không truy DB; record-level vẫn truy DB. `teamId` null cho admin (ngoài cây tổ chức).
 * `iat`/`exp` do `@nestjs/jwt` (jsonwebtoken) tự gắn khi sign.
 */
export interface AccessClaims {
  sub: string;
  role: Role;
  teamId: string | null;
}
