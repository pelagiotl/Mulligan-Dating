/**
 * Pending match to open when navigating to Matches tab (e.g. from "Send message" on celebration).
 * Used so we don't rely on tab params, which can be unreliable when switching tabs.
 */
let pendingOpenMatchId: string | null = null;

export function setPendingOpenMatchId(matchId: string | null): void {
  pendingOpenMatchId = matchId;
}

export function getPendingOpenMatchId(): string | null {
  return pendingOpenMatchId;
}

export function clearPendingOpenMatchId(): void {
  pendingOpenMatchId = null;
}

/** Dev celebration preview uses a fake id — never navigate or fetch for it. */
export function isDemoCelebrationMatchId(matchId: string | null | undefined): boolean {
  return typeof matchId === 'string' && matchId.startsWith('dev-');
}
