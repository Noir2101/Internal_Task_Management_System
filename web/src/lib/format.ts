/**
 * Display formatting for contract values. The backend sends ISO-8601 UTC (docs/06 §1); we render in
 * the user's locale for readability. Values sent back to the server stay in the contract format.
 */

/** ISO-8601 UTC → localized date+time. Null (no deadline) → em dash. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * ISO-8601 UTC → value for a datetime-local input (`YYYY-MM-DDTHH:mm`, in LOCAL time). Empty string
 * when null. The form converts back to ISO UTC on submit.
 */
export function toDateTimeLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value (local time) → ISO-8601 UTC. Empty string → null (clear the deadline). */
export function fromDateTimeLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}
