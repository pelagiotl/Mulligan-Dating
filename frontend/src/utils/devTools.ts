/**
 * Whether Settings should show the match celebration preview control.
 * - Local Vite dev server always
 * - Render deploys (*.onrender.com) for QA on mulligan-frontend.onrender.com
 * - Any build with VITE_ENABLE_MATCH_CELEBRATION_PREVIEW=true (e.g. custom domain)
 */
export function isMatchCelebrationPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (import.meta.env.VITE_ENABLE_MATCH_CELEBRATION_PREVIEW === "true") return true;
  if (typeof window !== "undefined" && /\.onrender\.com$/i.test(window.location.hostname)) {
    return true;
  }
  return false;
}
