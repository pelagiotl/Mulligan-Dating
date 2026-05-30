/** Mirrors backend DEFAULT_MATCH_SLOT_LIMIT — used for UI copy when API count is unavailable. */
export const DEFAULT_MATCH_SLOT_LIMIT = 10;

/** Active-connection cap for UI (launch floor is always DEFAULT_MATCH_SLOT_LIMIT). */
export function effectiveConnectionSlotLimit(apiSlotLimit?: number | null): number {
  const parsed = Math.floor(Number(apiSlotLimit ?? DEFAULT_MATCH_SLOT_LIMIT));
  const safe = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MATCH_SLOT_LIMIT;
  return Math.min(Math.max(safe, DEFAULT_MATCH_SLOT_LIMIT), DEFAULT_MATCH_SLOT_LIMIT);
}
