/**
 * Team feature types — mirror the frozen backend projection (docs/06 §8.2) and request DTOs.
 * Team has NO `leader` field (leadership is derived from User.role+teamId) and NO `updatedAt`.
 */

/** Team projection (docs/06 §8.2). Exactly these three fields. */
export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

/** POST /teams and PATCH /teams/:id bodies — both are `{name}` only (docs/06 §9.2). */
export interface CreateTeamInput {
  name: string;
}
export interface UpdateTeamInput {
  name: string;
}

/** PUT /teams/:id/leader body (docs/06 §9.2). `userId` must be an ACTIVE member of the team. */
export interface SetLeaderInput {
  userId: string;
}
