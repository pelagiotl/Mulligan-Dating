import { useEffect } from "react";

interface InterestCompatibilityModalProps {
  open: boolean;
  profileCompatibility: number | null;
  reasons: string[];
  sharedInterests: string[];
  onClose: () => void;
}

export default function InterestCompatibilityModal({
  open,
  profileCompatibility,
  reasons,
  sharedInterests,
  onClose,
}: InterestCompatibilityModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || profileCompatibility == null) return null;

  const high = profileCompatibility >= 80;

  return (
    <div className="interest-compat-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`interest-compat-modal${high ? " interest-compat-modal--high" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="interest-compat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="interest-compat-modal-inner">
          <p className="interest-compat-emoji" aria-hidden>
            🎯
          </p>
          <h2 id="interest-compat-title" className="interest-compat-title">
            {profileCompatibility}% interest match
          </h2>
          <p className="interest-compat-subtitle">
            This score reflects how your interests overlap—the more you have in common, the higher the connection.
          </p>
          {reasons.length > 0 ? (
            <ul className="interest-compat-reasons">
              {reasons.map((reason, i) => (
                <li key={i} className="interest-compat-reason">
                  <span className="interest-compat-bullet" aria-hidden>
                    ✓
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {sharedInterests.length > 0 ? (
            <div className="interest-compat-section">
              <h3 className="interest-compat-section-title">Shared interests</h3>
              <p className="interest-compat-section-body">{sharedInterests.join(", ")}</p>
            </div>
          ) : null}
          {!reasons.length && !sharedInterests.length ? (
            <p className="interest-compat-empty">
              Add more interests to your profile to see stronger overlap scores with people you vibe with.
            </p>
          ) : null}
          <p className="interest-compat-hint">Click outside to close</p>
        </div>
      </div>
    </div>
  );
}
