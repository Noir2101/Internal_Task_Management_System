/**
 * Chart palette for the leader dashboard. THREE progress hues (validated CVD-safe via the dataviz
 * `validate_palette.js` script: light worst-adjacent ΔE 24.2, dark 10.3 — legal with the direct
 * labels / segment gaps / companion table this dashboard ships). Overdue uses the RESERVED
 * status-critical red and appears only as a labeled KPI, never as a 4th progress bucket (docs/09 §3.5).
 * The app is light-only (theme.ts), so these fixed light-mode values match the app chrome.
 */

/** Progress buckets in canonical order (verbatim enum — no translation layer). */
export const PROGRESS_ORDER = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type ProgressKey = (typeof PROGRESS_ORDER)[number];

/** Categorical slots 1 / 3 / 4 (blue / amber / green) — consistent across every chart. */
export const PROGRESS_COLOR: Record<ProgressKey, string> = {
  TODO: '#2a78d6',
  IN_PROGRESS: '#eda100',
  DONE: '#008300',
};

/** Status-critical red — overdue KPI only, kept off the categorical axis. */
export const OVERDUE_COLOR = '#d03b3b';

/** Chart chrome (light surface) from the reference palette. */
export const CHART_INK = {
  surface: '#fcfcfb',
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
} as const;
