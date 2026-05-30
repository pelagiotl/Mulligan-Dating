import { useEffect } from "react";

const DEFAULT_MESSAGE = "Matching isn't open yet. Check back on launch day!";

export default function MatchmakingPausedModalWeb({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const body = message?.trim() || DEFAULT_MESSAGE;

  return (
    <div className="connect-photos-modal-overlay matchmaking-paused-modal-overlay" role="presentation">
      <button type="button" className="connect-photos-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="connect-photos-modal-dialog matchmaking-paused-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matchmaking-paused-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="matchmaking-paused-modal-rim">
          <span className="matchmaking-paused-modal-rim-shimmer" aria-hidden />
          <div className="matchmaking-paused-modal-inner">
            <span className="matchmaking-paused-modal-inner-shimmer" aria-hidden />
            <header className="matchmaking-paused-modal-header">
              <span
                className="launch-countdown__hourglass matchmaking-paused-modal-hourglass"
                aria-hidden
              >
                <span className="launch-countdown__hourglass-glow" />
                <span className="launch-countdown__hourglass-emoji">⏳</span>
                <span className="launch-countdown__hourglass-sand" />
              </span>
              <div>
                <p className="matchmaking-paused-modal-kicker">Launch countdown</p>
                <h2 id="matchmaking-paused-title" className="matchmaking-paused-modal-title">
                  Matching opens soon
                </h2>
              </div>
            </header>
            <div className="matchmaking-paused-modal-body">
              <p className="matchmaking-paused-modal-lead">{body}</p>
              <p className="matchmaking-paused-modal-sub">
                Finish your profile and add photos now — you&apos;ll be ready the moment we flip the switch.
              </p>
            </div>
            <footer className="connect-photos-modal-actions">
              <button type="button" className="connect-photos-modal-primary" onClick={onClose}>
                Got it
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
