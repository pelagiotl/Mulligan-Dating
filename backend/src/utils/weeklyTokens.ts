/**
 * Weekly token refill: rolling 7-day window per user.
 * Each user can claim again 7 days after their last weekly claim (or anytime if they've never claimed weekly).
 * Fair and simple: no fixed calendar day, no loopholes.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True if the user can claim weekly tokens: they have never claimed weekly, or their last weekly claim was 7+ days ago.
 */
export function canClaimWeekly(lastWeeklyGrantedAt: Date | string | null | undefined): boolean {
  if (lastWeeklyGrantedAt == null) return true;
  const last = new Date(lastWeeklyGrantedAt);
  return last.getTime() <= Date.now() - SEVEN_DAYS_MS;
}

/**
 * Next date when the user can claim (7 days after last weekly claim). Null if they've never claimed weekly.
 */
export function getNextRefillDate(lastWeeklyGrantedAt: Date | string | null | undefined): string | null {
  if (lastWeeklyGrantedAt == null) return null;
  const d = new Date(lastWeeklyGrantedAt);
  d.setTime(d.getTime() + SEVEN_DAYS_MS);
  return d.toISOString();
}
