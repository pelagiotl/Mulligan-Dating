import { useEffect } from "react";
import { createPortal } from "react-dom";
import { TOKEN_PURCHASE_REUP_MESSAGE } from "../constants/tokenCelebration";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
};

export default function TokenReupCelebrationModal({
  visible,
  onDismiss,
  message = TOKEN_PURCHASE_REUP_MESSAGE,
}: Props) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div className="token-reup-celebration-overlay" role="presentation">
      <button
        type="button"
        className="token-reup-celebration-backdrop"
        aria-label="Close celebration"
        onClick={onDismiss}
      />
      <div
        className="token-reup-celebration-card"
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="token-reup-celebration-emoji" aria-hidden>
          💰
        </span>
        <h2 className="token-reup-celebration-title">You&apos;re Reupped!</h2>
        <p className="token-reup-celebration-message">{message}</p>
        <button type="button" className="token-reup-celebration-cta" onClick={onDismiss}>
          Slay
        </button>
      </div>
    </div>,
    document.body
  );
}
