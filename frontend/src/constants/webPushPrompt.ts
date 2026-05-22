/** Set when user finishes Create Profile; cleared after prompt is shown or dismissed. */
export const WEB_PUSH_PROMPT_AFTER_PROFILE_KEY = "mulligan_prompt_web_push_after_profile";

export function markWebPushPromptAfterProfile(): void {
  try {
    sessionStorage.setItem(WEB_PUSH_PROMPT_AFTER_PROFILE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldShowWebPushPromptAfterProfile(): boolean {
  try {
    return sessionStorage.getItem(WEB_PUSH_PROMPT_AFTER_PROFILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearWebPushPromptAfterProfile(): void {
  try {
    sessionStorage.removeItem(WEB_PUSH_PROMPT_AFTER_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
