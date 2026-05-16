import { useEffect } from "react";

/** Full-screen moment when stage1 → stage2 (parity with mobile Matches celebration). */
export default function PhotoGalleryUnlockCelebration({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(onDismiss, 5200);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="photo-gallery-unlock-celebration-root" role="dialog" aria-modal="true" aria-live="polite">
      <button type="button" className="photo-gallery-unlock-celebration-backdrop" aria-label="Dismiss" onClick={onDismiss} />
      <div className="photo-gallery-unlock-celebration-shell" onClick={(e) => e.stopPropagation()}>
        <div className="photo-gallery-unlock-celebration-rim">
          <div className="photo-gallery-unlock-celebration-inner">
            <div className="photo-gallery-unlock-celebration-emoji" aria-hidden>
              🎉 📸
            </div>
            <h2 className="photo-gallery-unlock-celebration-title">All photos unlocked!</h2>
            <p className="photo-gallery-unlock-celebration-sub">
              {"You've both earned it — swipe through each other's full galleries."}
            </p>
            <button type="button" className="photo-gallery-unlock-celebration-dismiss" onClick={onDismiss}>
              Tap to dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
