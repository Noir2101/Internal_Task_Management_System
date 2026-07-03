/**
 * Presentation labels for the `progress` and `role` enums. These are DISPLAY-ONLY: the enum value is
 * what stays on the wire and in branching (docs/09 §3.5) — this map only decides the Vietnamese text
 * rendered in the UI, so it reads consistently with the friendly "Quá hạn" chip. Typed on the literal
 * unions so `lib` stays a leaf (no import back into a feature).
 */
export const PROGRESS_LABELS: Record<'TODO' | 'IN_PROGRESS' | 'DONE', string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang xử lý',
  DONE: 'Hoàn thành',
};

export const ROLE_LABELS: Record<'ADMIN' | 'LEADER' | 'MEMBER', string> = {
  ADMIN: 'Quản trị',
  LEADER: 'Trưởng nhóm',
  MEMBER: 'Thành viên',
};
