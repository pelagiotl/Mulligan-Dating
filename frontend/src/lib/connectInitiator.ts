/** User A (Connect initiator) — skip duplicate match toast/sound for their own new_match socket event. */

const INITIATOR_MATCH_ID_KEY = 'mulligan-initiator-match-id';
const INITIATOR_UNTIL_KEY = 'mulligan-initiator-match-until';
const INITIATOR_WINDOW_MS = 20_000;

/** Call when Connect starts (before API returns) to ignore premature new_match socket noise. */
export function markConnectInitiatorPending(): void {
  try {
    sessionStorage.setItem(INITIATOR_UNTIL_KEY, String(Date.now() + INITIATOR_WINDOW_MS));
  } catch {
    /* ignore */
  }
}

export function markConnectInitiator(matchId: string): void {
  try {
    sessionStorage.setItem(INITIATOR_MATCH_ID_KEY, matchId);
    sessionStorage.setItem(INITIATOR_UNTIL_KEY, String(Date.now() + INITIATOR_WINDOW_MS));
  } catch {
    /* ignore */
  }
}

export function clearConnectInitiator(): void {
  try {
    sessionStorage.removeItem(INITIATOR_MATCH_ID_KEY);
    sessionStorage.removeItem(INITIATOR_UNTIL_KEY);
  } catch {
    /* ignore */
  }
}

export function isIncomingMatchForConnectInitiator(matchId: string | undefined): boolean {
  if (!matchId) return false;
  try {
    const storedId = sessionStorage.getItem(INITIATOR_MATCH_ID_KEY);
    const until = Number(sessionStorage.getItem(INITIATOR_UNTIL_KEY) || 0);
    if (storedId && storedId === matchId) return true;
  } catch {
    /* ignore */
  }
  return false;
}
