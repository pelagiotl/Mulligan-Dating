import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./BetterMatchesCompleteCelebration.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function BetterMatchesCompleteCelebration({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="better-matches-celebration-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="better-matches-celebration-title"
    >
      <button
        type="button"
        className="better-matches-celebration-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="better-matches-celebration-dialog">
        <span className="better-matches-celebration-rim" aria-hidden />
        <span className="better-matches-celebration-spark better-matches-celebration-spark--1" aria-hidden>
          ✨
        </span>
        <span className="better-matches-celebration-spark better-matches-celebration-spark--2" aria-hidden>
          🎉
        </span>
        <span className="better-matches-celebration-spark better-matches-celebration-spark--3" aria-hidden>
          💫
        </span>
        <div className="better-matches-celebration-inner">
          <span className="better-matches-celebration-emoji-wrap" aria-hidden>
            <span className="better-matches-celebration-emoji-glow" />
            <span className="better-matches-celebration-emoji-orbit better-matches-celebration-emoji-orbit--1">
              ⭐
            </span>
            <span className="better-matches-celebration-emoji-orbit better-matches-celebration-emoji-orbit--2">
              ✦
            </span>
            <span className="better-matches-celebration-emoji-orbit better-matches-celebration-emoji-orbit--3">
              💫
            </span>
            <span className="better-matches-celebration-emoji">✨</span>
          </span>
          <p className="better-matches-celebration-kicker">Better matches</p>
          <h2 id="better-matches-celebration-title" className="better-matches-celebration-title">
            You&apos;re all set!
          </h2>
          <p className="better-matches-celebration-body">
            Every profile tip is complete. We&apos;ll use what you shared to curate stronger connections
            when you Connect.
          </p>
          <button type="button" className="better-matches-celebration-cta" onClick={onClose}>
            <span className="better-matches-celebration-cta-shimmer" aria-hidden />
            Let&apos;s get it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
