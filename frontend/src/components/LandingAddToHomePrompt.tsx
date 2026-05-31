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

type StepItem = { title: string; detail?: string };

function stepsForPlatform(
  platform: 'ios' | 'android' | 'other',
  mobile: boolean,
  canNativeInstall: boolean
): StepItem[] {
  if (mobile && platform === 'ios') {
    return [
      { title: 'Tap ⋯ at the bottom of Safari', detail: 'Then choose Share 📤' },
      { title: 'Swipe up on the share sheet', detail: 'Select Add to Home Screen' },
      { title: 'Tap Add', detail: 'Mulligan appears on your home screen' },
    ];
  }
  if (mobile && canNativeInstall) {
    return [
      { title: 'Tap Add to home screen below', detail: 'Chrome will guide you through install' },
      { title: 'Confirm when prompted', detail: 'The Mulligan icon lands on your home screen' },
      { title: 'Open from your home screen', detail: 'Feels like the app — faster every time' },
    ];
  }
  if (mobile) {
    return [
      { title: 'Open Chrome menu ⋮', detail: 'Top-right on Android' },
      { title: 'Choose Install app or Add to Home screen', detail: 'Wording varies by browser' },
      { title: 'Confirm Add', detail: 'Then open Mulligan from your home screen' },
    ];
  }
  return [
    { title: 'Open Mulligan on your phone', detail: 'Safari on iPhone works best' },
    { title: 'Tap ⋯ → Share → Add to Home Screen', detail: 'Swipe up on the share sheet if needed' },
    { title: 'Tap Add', detail: 'Use the home screen icon to sign in faster' },
  ];
}

function AddToHomeSteps({ steps }: { steps: StepItem[] }) {
  return (
    <ol className="landing-a2hs__steps">
      {steps.map((step, index) => (
        <li key={step.title} className="landing-a2hs__step">
          <span className="landing-a2hs__step-num" aria-hidden="true">
            {index + 1}
          </span>
          <span className="landing-a2hs__step-copy">
            <span className="landing-a2hs__step-title">{step.title}</span>
            {step.detail ? <span className="landing-a2hs__step-detail">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

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
  const steps = stepsForPlatform(platform, mobile, canNativeInstall);

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
            {featured && mobile
              ? 'Takes about 10 seconds — then open Mulligan like an app from your home screen.'
              : 'Install Mulligan on your home screen for a faster, app-like experience.'}
          </p>

          <AddToHomeSteps steps={steps} />

          {canNativeInstall ? (
            <button
              type="button"
              className="landing-a2hs__install"
              onClick={() => void handleInstall()}
              disabled={installing}
            >
              {installing ? 'Opening…' : 'Add to home screen'}
            </button>
          ) : null}
        </div>
        <button type="button" className="landing-a2hs__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          Not now
        </button>
      </div>
    </aside>
  );
}
