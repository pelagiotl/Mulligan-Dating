/** Shared copy for intro video onboarding — update when Luke's example clip is replaced. */

export const INTRO_VIDEO_LUKE_SCRIPT =
  "Hey, I'm Luke. Say your name, something you love doing around Southern Oregon, and what kind of connection you're looking for. Just be yourself and keep it natural.";

export const INTRO_VIDEO_ENCOURAGEMENT =
  'A quick video helps others see the real you and get better matches.';

export const INTRO_VIDEO_PROMPT =
  '10–15 seconds: your name, something you love in Southern Oregon, and what you\'re hoping to find.';

export const INTRO_VIDEO_TIPS = [
  'Keep it under 15 seconds',
  'Speak clearly and smile',
  'Face a window for good lighting',
  'Be yourself — natural beats perfect',
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
