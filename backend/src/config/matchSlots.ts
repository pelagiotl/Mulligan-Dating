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

/**
 * Max active incoming matches (where the user is the target/user2).
 * Keeps high-demand profiles from getting flooded at launch.
 * Override with INCOMING_MATCH_SLOT_LIMIT.
 */
function parseIncomingMatchSlotLimit(): number {
  const raw = process.env.INCOMING_MATCH_SLOT_LIMIT?.trim();
  if (!raw) return 7;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(n, 50);
}

export const DEFAULT_INCOMING_MATCH_SLOT_LIMIT = parseIncomingMatchSlotLimit();
