/**
 * Pending game request to show when navigating to Matches (e.g. from push notification tap).
 */
export interface PendingGameRequest {
  requestId: string;
  matchId: string;
  fromUserId: string;
  fromUserName: string;
  gameType: 'truth_or_dare' | 'never_have_i_ever';
}

let pending: PendingGameRequest | null = null;

export function setPendingGameRequest(req: PendingGameRequest | null): void {
  pending = req;
}

export function getPendingGameRequest(): PendingGameRequest | null {
  return pending;
}

export function clearPendingGameRequest(): void {
  pending = null;
}
