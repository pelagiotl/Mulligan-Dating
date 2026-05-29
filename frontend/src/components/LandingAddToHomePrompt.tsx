import { useCallback, useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  detectAddToHomePlatform,
  dismissAddToHomePrompt,
  shouldShowLandingAddToHomePrompt,
} from '../lib/addToHomeScreen';
import './LandingAddToHomePrompt.css';

/**
 * Mobile-only “add to home screen” hint on the public landing (`/`).
 * Not shown when already installed or after dismiss.
 */
export default function LandingAddToHomePrompt() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!shouldShowLandingAddToHomePrompt()) return;
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

  const canNativeInstall = platform === 'android' && installEvent != null;

  return (
    <aside className="landing-a2hs" aria-labelledby="landing-a2hs-title">
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
            Feels like the app — faster to open, smoother on your phone. Do it before you sign up or after, your call.
          </p>

          {platform === 'ios' ? (
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
          ) : canNativeInstall ? (
            <button
              type="button"
              className="landing-a2hs__install"
              onClick={() => void handleInstall()}
              disabled={installing}
            >
              {installing ? 'Opening…' : 'Add to home screen'}
            </button>
          ) : (
            <p className="landing-a2hs__hint">
              In Chrome: menu <strong>⋮</strong> → <strong>Install app</strong> or <strong>Add to Home screen</strong>
            </p>
          )}
        </div>
        <button type="button" className="landing-a2hs__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          Not now
        </button>
      </div>
    </aside>
  );
}
