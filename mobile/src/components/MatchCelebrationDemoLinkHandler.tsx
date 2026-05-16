import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import {
  MATCH_CELEBRATION_DEMO_DEEP_LINK,
  requestMatchCelebrationDemo,
} from '../utils/matchCelebrationDemo';

function isMatchCelebrationDemoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /match-celebration-demo/i.test(url);
}

/** __DEV__ only: `adb shell am start -a android.intent.action.VIEW -d "app.mulligandating://dev/match-celebration-demo" app.mulligandating */
export default function MatchCelebrationDemoLinkHandler() {
  useEffect(() => {
    if (!__DEV__) return;

    const handleUrl = (url: string | null | undefined) => {
      if (isMatchCelebrationDemoUrl(url)) {
        requestMatchCelebrationDemo();
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return null;
}

export { MATCH_CELEBRATION_DEMO_DEEP_LINK };
