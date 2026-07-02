/**
 * Task feature types — mirror the frozen backend projection (docs/06 §8.2) and request DTOs
 * (docs/06 §8.1). Enums are VERBATIM from the contract (docs/09 §3.5) — no translation layer.
 * FE never invents fields; it consumes exactly what the projection exposes.
 */

/** progress axis (docs/06 §1). Ordered for Select rendering. */
export const PROGRESS_VALUES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type Progress = (typeof PROGRESS_VALUES)[number];

/** owner/assignee brief and roster member — both are exactly {id,name} (docs/06 §8.2). */
export interface UserBrief {
  id: string;
  name: string;
}
export type RosterMember = UserBrief;

/**
 * Task projection (docs/06 §8.2). `overdue` is COMPUTED (deadline < now AND progress != DONE) — a
 * SEPARATE axis, never a 4th progress value (docs/09 §3.5). No teamId / raw ids / deletedAt exist here.
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  progress: Progress;
  deadline: string | null;
  overdue: boolean;
  owner: UserBrief;
  assignee: UserBrief;
  createdAt: string;
  updatedAt: string;
}

/** Pagination meta + list envelope (docs/06 §4.2). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface TaskListResult {
  data: Task[];
  meta: PaginationMeta;
}

/**
 * GET /tasks query (docs/06 §4.1). NO teamId (scope is server-derived). `overdue` is the boolean the
 * backend expects: true=only overdue, false=only on-time, undefined=all. All filters AND.
 */
export interface ListTasksParams {
  progress?: Progress;
  overdue?: boolean;
  assigneeId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

/** Tri-state overdue control (docs/09 §3.5). 'all' omits the param; the two axes are separate controls. */
export type OverdueFilter = 'all' | 'overdue' | 'ontime';

/**
 * POST /tasks body (docs/06 §8.1). `owner`/scope are NEVER sent (server-derived from JWT — anti
 * mass-assignment). `assigneeId` is REQUIRED for member (self) and leader (roster).
 */
export interface CreateTaskInput {
  title: string;
  description?: string | null;
  deadline?: string | null;
  assigneeId: string;
  allowPastDeadline?: boolean;
}

/**
 * PATCH /tasks/:id body (docs/06 §8.1). At least one of title/description/deadline. Absent = keep;
 * explicit null (description/deadline) = clear. The form sends only dirty fields.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  allowPastDeadline?: boolean;
}
