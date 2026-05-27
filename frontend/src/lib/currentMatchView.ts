/** Which match chat is open on /matches (set by Matches page). */
export const openMatchIdRef = { current: null as string | null };

/** True while the Matches route is mounted — used to scope openMatchIdRef suppression. */
export const matchesRouteActiveRef = { current: false };

/** Suppress in-app toast only when user is actively viewing this match's thread. */
export function shouldSuppressInAppMessageToast(matchId: string): boolean {
  return matchesRouteActiveRef.current && openMatchIdRef.current === matchId;
}
