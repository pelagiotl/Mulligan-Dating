import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MIN_PHOTOS_TO_CONNECT } from "../utils/connectProfileEligibility";

export default function ConnectPhotosRequiredModalWeb({
  open,
  onClose,
  photoCount,
}: {
  open: boolean;
  onClose: () => void;
  photoCount: number;
}) {
  const navigate = useNavigate();
  const needed = Math.max(0, MIN_PHOTOS_TO_CONNECT - photoCount);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const goToPhotos = () => {
    onClose();
    navigate("/profile#my-photos");
  };

  return (
    <div className="connect-photos-modal-overlay" role="presentation">
      <button type="button" className="connect-photos-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="connect-photos-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-photos-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="connect-photos-modal-rim">
          <div className="connect-photos-modal-inner">
            <header className="connect-photos-modal-header">
              <span className="connect-photos-modal-spark connect-photos-modal-spark--1" aria-hidden>
                ✨
              </span>
              <span className="connect-photos-modal-spark connect-photos-modal-spark--2" aria-hidden>
                💫
              </span>
              <div className="connect-photos-modal-header-copy">
                <p className="connect-photos-modal-kicker">One quick step</p>
                <h2 id="connect-photos-modal-title" className="connect-photos-modal-title">
                  Add {MIN_PHOTOS_TO_CONNECT} photos to Connect
                </h2>
              </div>
            </header>

            <div className="connect-photos-modal-body">
              <p className="connect-photos-modal-lead">
                You&apos;re set up with name and location — now show people who you are. Upload{" "}
                <strong>{MIN_PHOTOS_TO_CONNECT} clear photos</strong> and you&apos;ll be ready to match.
              </p>

              <div className="connect-photos-modal-slots" aria-label={`${photoCount} of ${MIN_PHOTOS_TO_CONNECT} photos uploaded`}>
                {Array.from({ length: MIN_PHOTOS_TO_CONNECT }, (_, i) => {
                  const filled = i < photoCount;
                  return (
                    <div
                      key={i}
                      className={`connect-photos-modal-slot ${filled ? "is-filled" : "is-empty"}`}
                    >
                      {filled ? (
                        <>
                          <span className="connect-photos-modal-slot-emoji" aria-hidden>
                            📷
                          </span>
                          <span className="connect-photos-modal-slot-check" aria-hidden>
                            ✓
                          </span>
                        </>
                      ) : (
                        <span className="connect-photos-modal-slot-plus" aria-hidden>
                          +
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="connect-photos-modal-progress">
                <strong>{photoCount}</strong> / {MIN_PHOTOS_TO_CONNECT} photos
                {needed > 0 ? (
                  <>
                    {" "}
                    — <span className="connect-photos-modal-progress-need">{needed} more to go</span>
                  </>
                ) : null}
              </p>

              <div className="connect-photos-modal-chips">
                <span className="connect-photos-modal-chip">😊 Face visible</span>
                <span className="connect-photos-modal-chip">☀️ Recent pics</span>
                <span className="connect-photos-modal-chip">✨ Show personality</span>
              </div>
            </div>

            <footer className="connect-photos-modal-actions">
              <button type="button" className="connect-photos-modal-primary" onClick={goToPhotos}>
                Add my photos →
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
