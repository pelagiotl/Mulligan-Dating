/**
 * Ref for the match conversation the user is currently viewing (if any).
 * Used by AuthContext to avoid showing in-app "New Message" alert when the user
 * is already in that match's chat. MatchesScreen sets/clears this when selectedMatch changes.
 */
export const currentMatchIdRef: { current: string | null } = { current: null };

/**
 * When User A (initiator) taps Connect and a match is created, we set this to the new matchId.
 * AuthContext skips in-app match notification (sound) for this matchId so only the celebration card is shown.
 * Cleared when the celebration is closed.
 */
export const initiatorMatchIdRef: { current: string | null } = { current: null };

/**
 * Set when User A taps Connect (before API returns). Used to suppress the "matched with you" push
 * if it arrives before we have matchId. Cleared after celebration or after 15s.
 */
export const connectInitiatorAtRef: { current: number | null } = { current: null };

const INITIATOR_SUPPRESS_MS = 15000;

/** True when this device just initiated the connect (Connect or Sober Circle). */
export function isConnectInitiatorMatch(matchId: string): boolean {
  return (
    initiatorMatchIdRef.current === matchId ||
    (connectInitiatorAtRef.current != null &&
      Date.now() - connectInitiatorAtRef.current < INITIATOR_SUPPRESS_MS)
  );
}

export function clearConnectInitiatorRefs(): void {
  initiatorMatchIdRef.current = null;
  connectInitiatorAtRef.current = null;
}
