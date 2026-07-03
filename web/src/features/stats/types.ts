/**
 * Stats read-model types (docs/06 §5). THREE OVERDUE invariants (docs/09 §3.5):
 *  1. `byProgress` has EXACTLY 3 keys (TODO/IN_PROGRESS/DONE) — overdue is NEVER a 4th bucket.
 *  2. `total` = sum of byProgress; `overdue` is a SIBLING, OUTSIDE total (DONE-overdue excluded).
 *  3. `byAssignee` is an OUTER-JOIN — idle members appear with all-zero counts.
 */

/** The 3-bucket progress breakdown — exactly these keys, never a 4th. */
export interface ProgressBreakdown {
  TODO: number;
  IN_PROGRESS: number;
  DONE: number;
}

/** Per-assignee slice of the read-model. `overdue` is a separate axis, not part of byProgress. */
export interface AssigneeStat {
  assignee: { id: string; name: string };
  byProgress: ProgressBreakdown;
  overdue: number;
}

/** GET /stats response (docs/06 §5). Scope is derived server-side from the JWT — no teamId param. */
export interface StatsResponse {
  scope: { teamId: string; teamName: string };
  total: number;
  byProgress: ProgressBreakdown;
  overdue: number;
  byAssignee: AssigneeStat[];
}
