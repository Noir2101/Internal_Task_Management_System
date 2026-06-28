/**
 * `AccessClaims` đã chuyển sang `common/auth-claims.ts` (tầng nền — `@CurrentUser`/`RolesGuard`
 * tiêu thụ nó). Re-export ở đây để các import cũ (`./auth.types`) không vỡ.
 */
export type { AccessClaims } from '../common/auth-claims';
