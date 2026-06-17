import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import {
  DATE_PLAN_PREVIEW_DEEP_LINK,
  requestDatePlanPreview,
} from '../utils/datePlanPreviewDemo';
import {
  MATCH_CELEBRATION_DEMO_DEEP_LINK,
  requestMatchCelebrationDemo,
} from '../utils/matchCelebrationDemo';

function isMatchCelebrationDemoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /match-celebration-demo/i.test(url);
}

function isDatePlanPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /date-plan-preview/i.test(url);
}

/** __DEV__ only deep links:
 *  iOS: xcrun simctl openurl booted "app.mulligandating://dev/date-plan-preview"
 *  Android: adb shell am start -a android.intent.action.VIEW -d "app.mulligandating://dev/date-plan-preview" app.mulligandating
 */
export default function MatchCelebrationDemoLinkHandler() {
  useEffect(() => {
    if (!__DEV__) return;

    const handleUrl = (url: string | null | undefined) => {
      if (isMatchCelebrationDemoUrl(url)) {
        requestMatchCelebrationDemo();
      } else if (isDatePlanPreviewUrl(url)) {
        requestDatePlanPreview();
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return null;
}

export { MATCH_CELEBRATION_DEMO_DEEP_LINK, DATE_PLAN_PREVIEW_DEEP_LINK };
