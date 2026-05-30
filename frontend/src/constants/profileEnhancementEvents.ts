export const PROFILE_ENHANCEMENT_REFRESH_EVENT = "mulligan:profile-enhancement-refresh";

/** Call after profile / photos change so Better matches celebration can run immediately. */
export function dispatchProfileEnhancementRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_ENHANCEMENT_REFRESH_EVENT));
}
