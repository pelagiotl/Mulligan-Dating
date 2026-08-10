/** Pacific offset for Mulligan Live Dates (Medford, OR — PDT in summer). */
const LIVE_DATES_PACIFIC_OFFSET = '-07:00';

/**
 * live_date_events.event_at is stored as Pacific wall-clock, but TIMESTAMP columns
 * round-trip through Postgres/node-pg as UTC Date objects. Re-attach Pacific offset
 * so clients show the intended local time (e.g. 5:30 PM, not 10:30 AM).
 */
export function liveEventAtForApi(raw: string | Date): string {
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const mo = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    const h = String(raw.getUTCHours()).padStart(2, '0');
    const mi = String(raw.getUTCMinutes()).padStart(2, '0');
    const s = String(raw.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${LIVE_DATES_PACIFIC_OFFSET}`;
  }
  const text = String(raw).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/);
  if (match && !/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) {
    const sec = match[3] ?? '00';
    return `${match[1]}T${match[2]}:${sec}${LIVE_DATES_PACIFIC_OFFSET}`;
  }
  return text;
}

export function liveEventAtForDb(pacificIso: string): string {
  const m = pacificIso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : pacificIso;
}
