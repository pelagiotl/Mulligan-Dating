import "./LaunchLiveConnectBanner.css";
import { LAUNCH_LIVE_BANNER_MESSAGE } from "../utils/launchLiveConnectPrompt";

type Props = {
  onConnect: () => void;
  onDismiss: () => void;
  connecting?: boolean;
};

export default function LaunchLiveConnectBanner({ onConnect, onDismiss, connecting }: Props) {
  return (
    <div className="launch-live-connect-banner" role="status" aria-live="polite">
      <div className="launch-live-connect-banner__copy">
        <span className="launch-live-connect-banner__badge" aria-hidden>
          🎉
        </span>
        <p className="launch-live-connect-banner__message">{LAUNCH_LIVE_BANNER_MESSAGE}</p>
      </div>
      <div className="launch-live-connect-banner__actions">
        <button
          type="button"
          className="launch-live-connect-banner__cta"
          onClick={onConnect}
          disabled={connecting}
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
        <button type="button" className="launch-live-connect-banner__dismiss" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
