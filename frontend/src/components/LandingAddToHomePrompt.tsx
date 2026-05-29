import { useCallback, useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  canShowLandingAddToHomeUi,
  clearAddToHomeDismiss,
  detectAddToHomePlatform,
  dismissAddToHomePrompt,
  isAddToHomeDismissed,
  isLikelyMobileBrowser,
  shouldShowLandingAddToHomePrompt,
} from '../lib/addToHomeScreen';
import './LandingAddToHomePrompt.css';

type LandingAddToHomePromptProps = {
  /** Stronger visual priority for first visit (landing `/` and login). */
  variant?: 'default' | 'featured';
};

/**
 * “Add to home screen” hint on public entry points (`/`, `/login`).
 * Offers “Show home screen tip” when dismissed via Not now.
 */
export default function LandingAddToHomePrompt({ variant = 'default' }: LandingAddToHomePromptProps) {
  const [showCard, setShowCard] = useState(false);
  const [showRestoreLink, setShowRestoreLink] = useState(false);
  const [mobile, setMobile] = useState(true);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const syncVisibility = useCallback((forceCard?: boolean) => {
    if (!canShowLandingAddToHomeUi()) {
      setShowCard(false);
      setShowRestoreLink(false);
      return;
    }
    const dismissed = isAddToHomeDismissed();
    if (forceCard || shouldShowLandingAddToHomePrompt()) {
      setShowCard(true);
      setShowRestoreLink(false);
    } else if (dismissed) {
      setShowCard(false);
      setShowRestoreLink(true);
    } else {
      setShowCard(false);
      setShowRestoreLink(false);
    }
  }, []);

  useEffect(() => {
    setMobile(isLikelyMobileBrowser());
    setPlatform(detectAddToHomePlatform());
    syncVisibility();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [syncVisibility]);

  const handleDismiss = useCallback(() => {
    dismissAddToHomePrompt();
    setShowCard(false);
    setShowRestoreLink(true);
  }, []);

  const handleShowAgain = useCallback(() => {
    clearAddToHomeDismiss();
    setMobile(isLikelyMobileBrowser());
    setPlatform(detectAddToHomePlatform());
    syncVisibility(true);
  }, [syncVisibility]);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      /* user cancelled or browser blocked */
    } finally {
      setInstalling(false);
    }
  }, [installEvent]);

  if (!canShowLandingAddToHomeUi()) return null;

  if (showRestoreLink && !showCard) {
    return (
      <div className="landing-a2hs-restore-wrap">
        <button type="button" className="landing-a2hs-restore" onClick={handleShowAgain}>
          <span className="landing-a2hs-restore__icon" aria-hidden="true">
            📲
          </span>
          Show home screen tip
        </button>
      </div>
    );
  }

  if (!showCard) return null;

  const canNativeInstall = mobile && platform === 'android' && installEvent != null;

  const featured = variant === 'featured';

  return (
    <aside
      className={[
        'landing-a2hs',
        featured ? 'landing-a2hs--featured' : '',
        mobile ? '' : 'landing-a2hs--desktop',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="landing-a2hs-title"
    >
      {featured ? (
        <span className="landing-a2hs__badge" aria-hidden="true">
          Recommended first step
        </span>
      ) : null}
      <div className="landing-a2hs__glow" aria-hidden="true" />
      <div className="landing-a2hs__shimmer" aria-hidden="true" />
      <div className="landing-a2hs__spark landing-a2hs__spark--1" aria-hidden="true" />
      <div className="landing-a2hs__spark landing-a2hs__spark--2" aria-hidden="true" />
      <div className="landing-a2hs__spark landing-a2hs__spark--3" aria-hidden="true" />
      <div className="landing-a2hs__inner">
        <div className="landing-a2hs__icon" aria-hidden="true">
          <span className="landing-a2hs__icon-emoji">📲</span>
        </div>
        <div className="landing-a2hs__copy">
          <p className="landing-a2hs__kicker">{featured && mobile ? 'Do this first' : 'Pro tip'}</p>
          <h2 id="landing-a2hs-title" className="landing-a2hs__title">
            Add Mulligan to your home screen
          </h2>
          <p className="landing-a2hs__body">
            {mobile
              ? featured
                ? 'Takes 10 seconds in Safari — then tap the Mulligan icon on your home screen anytime. Best before you sign up.'
                : 'Feels like the app — faster to open, smoother on your phone. Do it before you sign up or after, your call.'
              : 'Open Mulligan on your phone, then add it to your home screen for the best experience (Safari Share → Add to Home Screen).'}
          </p>

          {mobile && platform === 'ios' ? (
            <ol className="landing-a2hs__steps">
              <li>
                Tap <strong>Share</strong>{' '}
                <span className="landing-a2hs__share-icon" aria-hidden="true">
                  📤
                </span>{' '}
                in Safari
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>
              </li>
              <li>Tap <strong>Add</strong> — you&apos;re set</li>
            </ol>
          ) : mobile && canNativeInstall ? (
            <button
              type="button"
              className="landing-a2hs__install"
              onClick={() => void handleInstall()}
              disabled={installing}
            >
              {installing ? 'Opening…' : 'Add to home screen'}
            </button>
          ) : mobile ? (
            <p className="landing-a2hs__hint">
              In Chrome: menu <strong>⋮</strong> → <strong>Install app</strong> or <strong>Add to Home screen</strong>
            </p>
          ) : null}
        </div>
        <button type="button" className="landing-a2hs__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          Not now
        </button>
      </div>
    </aside>
  );
}
