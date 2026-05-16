import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';

const DEMO_LISTENERS = new Set<() => void>();

/** Set synchronously before navigation so Browse focus handlers do not clear the preview. */
let demoSessionActive = false;

export function isMatchCelebrationDemoSession(): boolean {
  return demoSessionActive;
}

export function endMatchCelebrationDemoSession(): void {
  demoSessionActive = false;
}

function navigateToBrowse(): void {
  if (!navigationRef.current?.isReady()) return;
  navigationRef.current.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: { screen: 'Browse' },
    })
  );
}

function fireDemoListeners(): void {
  DEMO_LISTENERS.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[matchCelebrationDemo] listener failed:', e);
    }
  });
}

/** Dev-only: open Connect tab and show the match celebration preview (initiator flow). */
export function requestMatchCelebrationDemo(): void {
  if (!__DEV__) return;

  demoSessionActive = true;

  let attempts = 0;
  const maxAttempts = 25;

  const tick = () => {
    attempts += 1;
    navigateToBrowse();
    if (DEMO_LISTENERS.size > 0) {
      fireDemoListeners();
      return;
    }
    if (attempts < maxAttempts) {
      setTimeout(tick, 400);
    } else {
      endMatchCelebrationDemoSession();
    }
  };

  setTimeout(tick, 300);
}

export function subscribeMatchCelebrationDemo(listener: () => void): () => void {
  DEMO_LISTENERS.add(listener);
  return () => DEMO_LISTENERS.delete(listener);
}

export const MATCH_CELEBRATION_DEMO_DEEP_LINK = 'app.mulligandating://dev/match-celebration-demo';
