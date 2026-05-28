import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  browserSupportsWebPush,
  getVapidPublicKey,
  registerWebPush,
} from "../lib/webPush";
import {
  clearWebPushPromptAfterProfile,
  shouldShowWebPushPromptAfterProfile,
} from "../constants/webPushPrompt";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * One-time prompt after profile creation (web). Browser push requires an explicit
 * permission request from a user gesture — iOS/Safari will not subscribe otherwise.
 */
export default function WebPushOnboardingPrompt({ open, onClose }: Props) {
  const { user, refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;
  if (!shouldShowWebPushPromptAfterProfile()) return null;
  if (!browserSupportsWebPush() || !getVapidPublicKey() || !user?.webPushConfigured) {
    return null;
  }

  const perm =
    typeof Notification !== "undefined" ? Notification.permission : "denied";
  if (perm === "denied") {
    return null;
  }

  const alreadySubscribed =
    perm === "granted" && (user.webPushSubscriptionCount ?? 0) > 0;

  const dismiss = () => {
    clearWebPushPromptAfterProfile();
    onClose();
  };

  const handleEnable = async () => {
    setError("");
    setBusy(true);
    try {
      if (perm !== "granted") {
        const next = await Notification.requestPermission();
        if (next !== "granted") {
          setError(
            next === "denied"
              ? "Notifications are blocked. You can enable them later in Settings."
              : "Notifications were not enabled."
          );
          if (next === "denied") dismiss();
          return;
        }
      }
      await registerWebPush();
      await refreshSession({ silent: true });
      dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  if (alreadySubscribed) {
    dismiss();
    return null;
  }

  return (
    <div className="web-push-prompt-overlay" role="presentation" onClick={dismiss}>
      <div
        className="web-push-prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-push-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="web-push-prompt-kicker">Stay in the loop</p>
        <h2 id="web-push-prompt-title" className="web-push-prompt-title">
          Turn on browser notifications?
        </h2>
        <p className="web-push-prompt-body">
          Get alerts for new matches and messages when Mulligan isn&apos;t open. On iPhone, add Mulligan to your Home
          Screen first, then tap Enable. If you skip this now, you can always turn it on later in Settings under
          Browser notifications.
        </p>
        {error ? <p className="auth-error web-push-prompt-error">{error}</p> : null}
        <div className="web-push-prompt-actions">
          <button type="button" className="btn btn-secondary" onClick={dismiss} disabled={busy}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleEnable()} disabled={busy}>
            {busy ? "Working…" : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
