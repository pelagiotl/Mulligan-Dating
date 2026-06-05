export const LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY = "mulligan:launch-go-live-celebration-seen";

export function isLaunchGoLiveCelebrationSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLaunchGoLiveCelebrationSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
