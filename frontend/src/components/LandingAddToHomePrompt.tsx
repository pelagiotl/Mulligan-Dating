import { useCallback, useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  detectAddToHomePlatform,
  dismissAddToHomePrompt,
  isLikelyMobileBrowser,
  shouldShowLandingAddToHomePrompt,
} from '../lib/addToHomeScreen';
import './LandingAddToHomePrompt.css';

/**
 * “Add to home screen” hint on the public landing (`/`) only.
 * Hidden when already installed as PWA or after dismiss.
 */
export default function LandingAddToHomePrompt() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(true);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!shouldShowLandingAddToHomePrompt()) return;
    setMobile(isLikelyMobileBrowser());
    setPlatform(detectAddToHomePlatform());
    setOpen(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const handleDismiss = useCallback(() => {
    dismissAddToHomePrompt();
    setOpen(false);
  }, []);

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
      setOpen(false);
    }
  }, [installEvent]);

  if (!open) return null;

  const canNativeInstall = mobile && platform === 'android' && installEvent != null;

  return (
    <aside
      className={`landing-a2hs${mobile ? '' : ' landing-a2hs--desktop'}`}
      aria-labelledby="landing-a2hs-title"
    >
      <div className="landing-a2hs__glow" aria-hidden="true" />
      <div className="landing-a2hs__inner">
        <div className="landing-a2hs__icon" aria-hidden="true">
          <span className="landing-a2hs__icon-emoji">📲</span>
        </div>
        <div className="landing-a2hs__copy">
          <p className="landing-a2hs__kicker">Pro tip</p>
          <h2 id="landing-a2hs-title" className="landing-a2hs__title">
            Add Mulligan to your home screen
          </h2>
          <p className="landing-a2hs__body">
            {mobile
              ? 'Feels like the app — faster to open, smoother on your phone. Do it before you sign up or after, your call.'
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
