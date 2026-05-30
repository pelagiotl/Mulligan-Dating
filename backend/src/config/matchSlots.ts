/**
 * Max active (non-expired) matches per user at once.
 * Override with MATCH_SLOT_LIMIT on the server (e.g. Render) without redeploying clients.
 */
function parseMatchSlotLimit(): number {
  const raw = process.env.MATCH_SLOT_LIMIT?.trim();
  if (!raw) return 10;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, 50);
}

export const DEFAULT_MATCH_SLOT_LIMIT = parseMatchSlotLimit();
