/** June 6, 2026 at 3:00 PM Pacific (PDT, UTC−7). Keep in sync with `frontend/src/constants/launchSchedule.ts`. */
export const LAUNCH_INSTANT_ISO = '2026-06-06T15:00:00-07:00';

export const LAUNCH_LABEL = 'June 6 · 3pm PT';

export function launchHourUnit(hours: number): string {
  return hours === 1 ? 'Hour' : 'Hours';
}

export type LaunchRemaining = { live: true } | { live: false; days: number; hours: number };

export function getLaunchInstantMs(): number {
  return new Date(LAUNCH_INSTANT_ISO).getTime();
}

/** Calendar days until launch date in Pacific (May 31 → June 6 = 6). */
export function pacificCalendarDaysUntilLaunch(nowMs: number, launchMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const toUtcDay = (ms: number) => {
    const parts = fmt.formatToParts(new Date(ms));
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    return Date.UTC(y, m - 1, d);
  };
  const diffDays = Math.round((toUtcDay(launchMs) - toUtcDay(nowMs)) / 86400000);
  return Math.max(0, diffDays);
}

export function computeLaunchRemaining(nowMs = Date.now()): LaunchRemaining {
  const launchMs = getLaunchInstantMs();
  const diff = launchMs - nowMs;
  if (diff <= 0) {
    return { live: true };
  }
  const days = pacificCalendarDaysUntilLaunch(nowMs, launchMs);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return { live: false, days, hours };
}
