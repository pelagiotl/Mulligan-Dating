/** Shared copy for intro video onboarding. */

export const INTRO_VIDEO_ENCOURAGEMENT =
  'A quick video helps others see the real you and get better matches.';

/** Prominent onboarding callout — any short clip is fine, not just a talking-head recording. */
export const INTRO_VIDEO_UPLOAD_ANY_HEADLINE = 'Record or upload any short clip — it\'s easy';

export const INTRO_VIDEO_UPLOAD_ANY =
  'Use your camera, or pick from your camera roll: a TikTok reel, you snowboarding, DJing, golfing, dancing, or any clip that shows the real you. Just keep it 3–15 seconds.';

export const INTRO_VIDEO_UPLOAD_ANY_SHORT =
  'Record or upload any clip from your roll — TikTok reel, hobbies, activities — 3–15 sec.';

export const INTRO_VIDEO_PROMPT =
  '10–15 seconds: your name, something you love in Southern Oregon, and what you\'re hoping to find.';

export const INTRO_VIDEO_TIPS = [
  'Keep it under 15 seconds',
] as const;

/** Hard limits — keep in sync with backend/src/constants/introVideo.ts */
export const INTRO_VIDEO_MAX_DURATION_SEC = 15;
export const INTRO_VIDEO_MIN_DURATION_SEC = 3;
export const INTRO_VIDEO_MAX_DURATION_MS = INTRO_VIDEO_MAX_DURATION_SEC * 1000;

export function introVideoDurationError(durationMs: number): string {
  const sec = durationMs / 1000;
  if (sec < INTRO_VIDEO_MIN_DURATION_SEC) {
    return `Intro video must be at least ${INTRO_VIDEO_MIN_DURATION_SEC} seconds.`;
  }
  return `Intro video must be ${INTRO_VIDEO_MAX_DURATION_SEC} seconds or less. Please trim or re-record.`;
}
