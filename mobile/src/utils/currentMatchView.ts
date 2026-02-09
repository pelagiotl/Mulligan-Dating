/**
 * Ref for the match conversation the user is currently viewing (if any).
 * Used by AuthContext to avoid showing in-app "New Message" alert when the user
 * is already in that match's chat. MatchesScreen sets/clears this when selectedMatch changes.
 */
export const currentMatchIdRef: { current: string | null } = { current: null };
