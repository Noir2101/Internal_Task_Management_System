import type { AccessClaims } from '../../auth/auth.types';

export {};

declare global {
  namespace Express {
    interface Request {
      /** Gắn bởi requestIdMiddleware; đi vào envelope lỗi để dò log. */
      requestId?: string;
      /** Gắn bởi JwtAuthGuard sau khi verify access token (claims sub/role/teamId). */
      user?: AccessClaims;
    }
  }
}
