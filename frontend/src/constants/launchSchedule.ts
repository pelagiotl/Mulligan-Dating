/** June 6, 2026 at 3:00 PM Pacific (PDT, UTC−7). Keep in sync with `mobile/src/constants/launchSchedule.ts`. */
export const LAUNCH_INSTANT_ISO = '2026-06-06T15:00:00-07:00';

export const LAUNCH_LABEL = 'June 6 · 3pm PT';

export function launchHourUnit(hours: number): string {
  return hours === 1 ? 'Hour' : 'Hours';
}

export type LaunchRemaining = { live: true } | { live: false; days: number; hours: number };

export function getLaunchInstantMs(): number {
  return new Date(LAUNCH_INSTANT_ISO).getTime();
}

/**
 * Split time until launch into 24-hour days + hours (always sums correctly).
 * Uses LAUNCH_INSTANT_ISO (June 6, 2026 3pm PT), not calendar date diff alone.
 */
export function computeLaunchRemaining(nowMs = Date.now()): LaunchRemaining {
  const launchMs = getLaunchInstantMs();
  const diff = launchMs - nowMs;
  if (diff <= 0) {
    return { live: true };
  }
  const totalHours = Math.floor(diff / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return { live: false, days, hours };
}
