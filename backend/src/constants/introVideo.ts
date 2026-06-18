/** Intro profile clips: product copy says 10–15s; hard cap at 15s server-side. */
export const INTRO_VIDEO_MAX_DURATION_SEC = 15;
export const INTRO_VIDEO_MIN_DURATION_SEC = 3;

export function introVideoDurationError(durationSec: number): string {
  if (durationSec < INTRO_VIDEO_MIN_DURATION_SEC) {
    return `Intro video must be at least ${INTRO_VIDEO_MIN_DURATION_SEC} seconds.`;
  }
  return `Intro video must be ${INTRO_VIDEO_MAX_DURATION_SEC} seconds or less.`;
}

export function isIntroVideoDurationValid(durationSec: number): boolean {
  return (
    durationSec >= INTRO_VIDEO_MIN_DURATION_SEC &&
    durationSec <= INTRO_VIDEO_MAX_DURATION_SEC
  );
}
