import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../utils/bodyScrollLock";

type PulseEngagement = "cold" | "neutral" | "warming" | "hot";

const TIER_LABEL: Record<PulseEngagement, string> = {
  cold: "Cool",
  neutral: "Steady",
  warming: "Warming up",
  hot: "Hot streak",
};

const TIER_BLURB: Record<PulseEngagement, string> = {
  cold: "The chat is quiet or still warming up — very normal when you’re just getting started.",
  neutral: "A steady rhythm is forming. Keep showing up in the thread and this can climb.",
  warming: "Momentum is building — you’re both replying, reading, and putting real energy in.",
  hot: "You’re in the flow — quick back-and-forth, thoughtful messages, and strong mutual engagement.",
};

function engagementTierFromScore(score: number): PulseEngagement {
  if (score >= 75) return "hot";
  if (score >= 60) return "warming";
  if (score >= 40) return "neutral";
  return "cold";
}

interface CompatibilityPulseModalProps {
  open: boolean;
  score: number;
  engagement: PulseEngagement | null;
  onClose: () => void;
}

export default function CompatibilityPulseModal({
  open,
  score,
  engagement,
  onClose,
}: CompatibilityPulseModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  const tier = engagement ?? engagementTierFromScore(score);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const overlay = (
    <div className="pulse-compat-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`pulse-compat-modal pulse-compat-modal--${tier}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-compat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pulse-compat-modal-glow" aria-hidden />
        <div className="pulse-compat-modal-inner">
          <div className="pulse-compat-hero">
            <span className="pulse-compat-hero-dot" aria-hidden />
            <p className="pulse-compat-kicker">Compatibility pulse</p>
            <p id="pulse-compat-title" className="pulse-compat-score">
              <span className="pulse-compat-score-num">{clamped}</span>
              <span className="pulse-compat-score-suffix">/100</span>
            </p>
            <span className={`pulse-compat-tier-chip pulse-compat-tier-chip--${tier}`}>
              {TIER_LABEL[tier]}
            </span>
          </div>
          <p className="pulse-compat-lead">{TIER_BLURB[tier]}</p>
          <div className="pulse-compat-factors">
            <h3 className="pulse-compat-factors-title">What moves the needle</h3>
            <ul className="pulse-compat-factor-list">
              <li>
                <span className="pulse-compat-factor-icon" aria-hidden>
                  ⏱
                </span>
                <span>How quickly you tend to reply to each other</span>
              </li>
              <li>
                <span className="pulse-compat-factor-icon" aria-hidden>
                  ✍️
                </span>
                <span>Message depth — thoughtful texts score higher than one-word pings</span>
              </li>
              <li>
                <span className="pulse-compat-factor-icon" aria-hidden>
                  💬
                </span>
                <span>Conversation volume — more real back-and-forth helps</span>
              </li>
              <li>
                <span className="pulse-compat-factor-icon" aria-hidden>
                  👀
                </span>
                <span>Whether messages are being read, not just sent</span>
              </li>
            </ul>
          </div>
          <p className="pulse-compat-footnote">
            Pulse is separate from your interest overlap score — it reflects how this specific chat is going, and it
            updates when new messages land.
          </p>
          <button type="button" className="pulse-compat-close-btn" onClick={onClose}>
            Close
          </button>
          <p className="pulse-compat-dismiss-hint">Or tap outside to dismiss</p>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
