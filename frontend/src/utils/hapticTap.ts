/** Mirrors Android `FastTabBarButton` — `Vibration.vibrate(30)` on tab press. */
const TAB_TAP_MS = 30;

/**
 * Light haptic for bottom tab bar taps (mobile web / Android Chrome).
 * No-op when Vibration API is missing or the user prefers reduced motion.
 */
export function hapticTabTap(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(TAB_TAP_MS);
    }
  } catch {
    // Unsupported or blocked (e.g. some iOS browsers)
  }
}
