export const LAUNCH_LIVE_PROMPT_SEEN_KEY = "mulligan:launch-live-connect-prompt-seen";

export const LAUNCH_LIVE_BANNER_MESSAGE = "We're live — tap Connect to start matching.";

export function isLaunchLiveConnectPromptSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LAUNCH_LIVE_PROMPT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLaunchLiveConnectPromptSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAUNCH_LIVE_PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
