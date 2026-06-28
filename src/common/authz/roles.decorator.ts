import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'authz:roles';

/**
 * Hành vi khi role sai ở rìa (docs/06 §3 keystone — split đã chốt):
 * - `hide`   → 404 RESOURCE_NOT_FOUND. Cho surface mà người gọi KHÔNG được thấy tồn tại
 *              (vd non-admin gọi `/users`,`/teams` admin-only).
 * - `forbid` → 403 + `code`. Cho resource người gọi THẤY ĐƯỢC nhưng sai vai trò
 *              (vd member gọi `/stats` leader-only → `FORBIDDEN`).
 */
export type DenyMode = { kind: 'hide' } | { kind: 'forbid'; code: string };

export interface RolesMeta {
  roles: Role[];
  onDeny: DenyMode;
}

/**
 * Guard vai trò ở rìa HTTP: "role này có được gọi endpoint không". Đọc bởi `RolesGuard`.
 * `onDeny` mặc định `hide` (404) — khớp tinh thần keystone giấu tồn tại; endpoint nào muốn lộ 403
 * (vd `/stats`) truyền `{ kind:'forbid', code:'FORBIDDEN' }`.
 *
 * KHÔNG mang record-level (one-law-per-endpoint của Tasks ở Bước 4) — đây chỉ là guard role.
 */
export const Roles = (
  roles: Role[],
  onDeny: DenyMode = { kind: 'hide' },
): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, { roles, onDeny } satisfies RolesMeta);
