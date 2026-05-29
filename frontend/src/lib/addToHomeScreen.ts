const DISMISS_KEY = 'mulligan-a2hs-landing-dismissed';
const DISMISS_DAYS = 14;

export type AddToHomePlatform = 'ios' | 'android' | 'other';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isLikelyMobileBrowser(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && window.innerWidth < 900;
}

export function detectAddToHomePlatform(): AddToHomePlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function isAddToHomeDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number.parseInt(raw, 10);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissAddToHomePrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearAddToHomeDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

/** True when user may see the landing add-to-home UI (card or “show again” link). */
export function canShowLandingAddToHomeUi(): boolean {
  return !isStandaloneDisplay();
}

export function shouldShowLandingAddToHomePrompt(): boolean {
  if (isStandaloneDisplay()) return false;
  if (isAddToHomeDismissed()) return false;
  return true;
}

/** Chromium PWA install prompt (Android / some desktop). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
