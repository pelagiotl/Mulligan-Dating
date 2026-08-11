/**
 * Monthly token refill: rolling 30-day window per user.
 * First allotment (claim on Connect) is available immediately; later refills unlock
 * 30 days after the last free allotment grant (initial, weekly legacy, or monthly).
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type TokenAllotmentRow = {
  source?: string | null;
  granted_at: string;
};

/** Free monthly / signup allotment sources (excludes IAP, admin, dev, etc.). */
export function isAllotmentSource(source: string | null | undefined): boolean {
  return !source || source === "weekly" || source === "monthly" || source === "initial";
}

export function hasReceivedTokenAllotment(tokens: TokenAllotmentRow[]): boolean {
  return tokens.some((t) => isAllotmentSource(t.source));
}

/** Most recent allotment grant (tokens should be ordered by granted_at DESC). */
export function getLastAllotmentGrantedAt(tokens: TokenAllotmentRow[]): string | null {
  const allotment = tokens.filter((t) => isAllotmentSource(t.source));
  if (allotment.length === 0) return null;
  return allotment[0].granted_at;
}

/**
 * True if the user can claim another free allotment now (30 days after last grant, or first claim ever).
 */
export function canClaimWeekly(lastAllotmentGrantedAt: Date | string | null | undefined): boolean {
  if (lastAllotmentGrantedAt == null) return true;
  const last = new Date(lastAllotmentGrantedAt);
  return last.getTime() <= Date.now() - THIRTY_DAYS_MS;
}

/**
 * Next date when the user can claim (30 days after last allotment grant). Null if never granted.
 */
export function getNextRefillDate(lastAllotmentGrantedAt: Date | string | null | undefined): string | null {
  if (lastAllotmentGrantedAt == null) return null;
  const d = new Date(lastAllotmentGrantedAt);
  d.setTime(d.getTime() + THIRTY_DAYS_MS);
  return d.toISOString();
}

export function computeWeeklyClaimEligibility(
  tokens: TokenAllotmentRow[],
  availableTokens: number
): { canClaimWeeklyToken: boolean; nextRefillDate: string | null } {
  const lastGrant = getLastAllotmentGrantedAt(tokens);

  if (availableTokens >= 7) {
    return {
      canClaimWeeklyToken: false,
      nextRefillDate: getNextRefillDate(lastGrant),
    };
  }

  if (!hasReceivedTokenAllotment(tokens)) {
    return { canClaimWeeklyToken: true, nextRefillDate: null };
  }

  const canClaim = canClaimWeekly(lastGrant);
  return {
    canClaimWeeklyToken: canClaim,
    nextRefillDate: getNextRefillDate(lastGrant),
  };
}
