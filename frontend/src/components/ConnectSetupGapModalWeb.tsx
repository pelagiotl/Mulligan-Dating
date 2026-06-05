import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  connectSetupGapModalEmoji,
  connectSetupGapModalTitle,
  connectSetupGapPath,
  connectSetupGapPrimaryLabel,
  connectSetupGapUserMessage,
  type ConnectSetupGap,
} from "../utils/connectProfileEligibility";

type Props = {
  gap: ConnectSetupGap | null;
  onClose: () => void;
};

export default function ConnectSetupGapModalWeb({ gap, onClose }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!gap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gap, onClose]);

  if (!gap || gap === "photos") return null;

  const openTarget = () => {
    onClose();
    navigate(connectSetupGapPath(gap));
  };

  return (
    <div className="connect-photos-modal-overlay" role="presentation">
      <button
        type="button"
        className="connect-photos-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="connect-photos-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-setup-gap-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="connect-photos-modal-rim">
          <div className="connect-photos-modal-inner">
            <header className="connect-photos-modal-header">
              <span className="connect-photos-modal-spark connect-photos-modal-spark--1" aria-hidden>
                {connectSetupGapModalEmoji(gap)}
              </span>
              <div className="connect-photos-modal-header-copy">
                <p className="connect-photos-modal-kicker">One quick step</p>
                <h2 id="connect-setup-gap-modal-title" className="connect-photos-modal-title">
                  {connectSetupGapModalTitle(gap)}
                </h2>
              </div>
            </header>

            <div className="connect-photos-modal-body">
              <p className="connect-photos-modal-lead">{connectSetupGapUserMessage(gap)}</p>
            </div>

            <footer className="connect-photos-modal-actions">
              <button type="button" className="connect-photos-modal-primary" onClick={openTarget}>
                {connectSetupGapPrimaryLabel(gap)}
              </button>
              <button type="button" className="connect-photos-modal-secondary" onClick={onClose}>
                Not now
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
