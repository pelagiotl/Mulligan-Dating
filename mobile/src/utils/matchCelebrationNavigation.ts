import { navigationRef } from '../navigation/navigationRef';
import { isConnectInitiatorMatch } from './currentMatchView';

export type MatchCelebrationPool = 'connect' | 'sober_circle' | 'golf_date';

export function navigateToNewMatchCelebration(
  matchId: string,
  options?: { matchName?: string; connectedVia?: MatchCelebrationPool },
): boolean {
  if (!matchId || isConnectInitiatorMatch(matchId)) {
    return false;
  }
  if (!navigationRef.current?.isReady()) {
    return false;
  }

  const matchName = options?.matchName ?? 'Someone';
  const isSober = options?.connectedVia === 'sober_circle';

  try {
    if (isSober) {
      navigationRef.current.navigate('MainTabs', {
        screen: 'SoberCircle',
        params: {
          screen: 'SoberCircleChat',
          params: {
            matchId,
            showMatchCelebration: true,
            matchName,
            soberCircleMode: true,
          },
        },
      });
    } else {
      navigationRef.current.navigate('MainTabs', {
        screen: 'Matches',
        params: { matchId, showMatchCelebration: true, matchName },
      });
    }
    return true;
  } catch (error) {
    console.error('navigateToNewMatchCelebration failed:', error);
    return false;
  }
}

export function attemptNavigateToNewMatchCelebration(
  matchId: string,
  options?: { matchName?: string; connectedVia?: MatchCelebrationPool },
  attempt = 0,
  maxAttempts = 10,
): void {
  if (navigateToNewMatchCelebration(matchId, options)) return;
  if (attempt >= maxAttempts) return;
  setTimeout(
    () => attemptNavigateToNewMatchCelebration(matchId, options, attempt + 1, maxAttempts),
    500,
  );
}

export function parseMatchCelebrationPool(
  connectedVia: unknown,
): MatchCelebrationPool {
  if (connectedVia === 'sober_circle') return 'sober_circle';
  if (connectedVia === 'golf_date') return 'golf_date';
  return 'connect';
}
