import { useEffect } from "react";

/** Mulligan-styled explainer (replaces plain browser alerts / generic white dialogs). */
export default function PhotoUnlockExplainerModalWeb({
  open,
  onClose,
  partnerDisplayName,
}: {
  open: boolean;
  onClose: () => void;
  partnerDisplayName: string;
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

  const name = partnerDisplayName.trim() || "your match";

  return (
    <div className="photo-unlock-explainer-overlay" role="presentation">
      <button type="button" className="photo-unlock-explainer-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="photo-unlock-explainer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-unlock-explainer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="photo-unlock-explainer-rim">
          <div className="photo-unlock-explainer-inner">
            <header className="photo-unlock-explainer-header">
              <span className="photo-unlock-explainer-emoji" aria-hidden>
                📸 ✨
              </span>
              <div>
                <p className="photo-unlock-explainer-kicker">Photo reveal</p>
                <h2 id="photo-unlock-explainer-title" className="photo-unlock-explainer-title">
                  Unlock all photos
                </h2>
              </div>
            </header>
            <div className="photo-unlock-explainer-body">
              <p className="photo-unlock-explainer-lead">
                You each see <strong>one photo</strong> at first. After you and{" "}
                <strong className="photo-unlock-explainer-name">{name}</strong> have each sent at least{" "}
                <strong>3 messages</strong> in this chat, you&apos;ll both see each other&apos;s full galleries.
              </p>
              <div className="photo-unlock-explainer-chips">
                <span className="photo-unlock-explainer-chip">📷 1 preview each</span>
                <span className="photo-unlock-explainer-chip">💬 3 msgs each → unlock</span>
              </div>
            </div>
            <footer className="photo-unlock-explainer-actions">
              <button type="button" className="btn btn-primary photo-unlock-explainer-gotit" onClick={onClose}>
                Got it
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
