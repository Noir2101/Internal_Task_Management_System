/**
 * Auth types. Enums are kept verbatim from the backend (docs/06 §1) — no translation layer.
 * `Identity` mirrors the login/me `user` projection (docs/06 §6.2): exactly {id,name,role,teamId}.
 */
export type Role = 'ADMIN' | 'LEADER' | 'MEMBER';

export interface Identity {
  id: string;
  name: string;
  role: Role;
  teamId: string | null;
}
