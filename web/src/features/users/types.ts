import type { Role } from '../../auth/types';

/**
 * User feature types — mirror the frozen backend projection (docs/06 §8.2) and request DTOs
 * (docs/06 §8.1). Enum VALUES are verbatim from the contract on the wire (docs/09 §3.5); UI labels
 * come from lib/labels.ts. FE never invents server-derived fields (id/isActive/createdAt) into bodies.
 */

/** Role axis (docs/06 §1). Ordered for Select rendering; type is the single source in auth/types. */
export const ROLE_VALUES: readonly Role[] = ['ADMIN', 'LEADER', 'MEMBER'];
export type { Role };

/**
 * User projection (docs/06 §8.2). `teamId` is null for ADMIN. NO `updatedAt`/`passwordHash` — the
 * default-deny mapper drops everything outside this whitelist.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Pagination meta + list envelope (docs/06 §4.2 — same shape as tasks). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface UserListResult {
  data: User[];
  meta: PaginationMeta;
}

/**
 * GET /users query (docs/06 §9.1). Default excludes inactive unless `includeInactive`. Sort is fixed
 * server-side (createdAt DESC, id DESC). page def 1, limit def 20 cap 100.
 */
export interface ListUsersParams {
  role?: Role;
  teamId?: string;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

/**
 * POST /users body (docs/06 §8.1). id/isActive/createdAt are server-derived — NEVER sent (anti
 * mass-assignment). `teamId` REQUIRED for LEADER/MEMBER, ABSENT for ADMIN (AdminTeamConsistent).
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: Role;
  teamId?: string;
}

/** PATCH /users/:id body (docs/06 §9.5). ONLY `name` — role/teamId are immutable post-create. */
export interface UpdateUserInput {
  name: string;
}

/** POST /users/:id/deactivate response (docs/06 §9.3). */
export interface DeactivateResult {
  user: User;
  orphanedTaskCount: number;
}
