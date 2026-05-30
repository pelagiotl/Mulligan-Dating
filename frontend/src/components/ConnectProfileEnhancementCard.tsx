import type { ProfileEnhancementItem } from "../utils/profileEnhancementChecklist";
import "./ConnectProfileEnhancementCard.css";

type Props = {
  items: ProfileEnhancementItem[];
  onItemClick: (item: ProfileEnhancementItem) => void;
  onOpenProfile: () => void;
  onDismiss: () => void;
};

export default function ConnectProfileEnhancementCard({
  items,
  onItemClick,
  onOpenProfile,
  onDismiss,
}: Props) {
  if (items.length === 0) return null;

  const total = 5;
  const done = total - items.length;
  const progressPct = Math.round((done / total) * 100);

  return (
    <aside className="connect-enhancement" aria-label="Improve your profile for better matches">
      <div className="connect-enhancement__accent" aria-hidden />
      <div className="connect-enhancement__head">
        <div className="connect-enhancement__title-wrap">
          <span className="connect-enhancement__icon" aria-hidden>
            ✨
          </span>
          <p className="connect-enhancement__eyebrow">Better matches</p>
        </div>
        <p className="connect-enhancement__progress" aria-live="polite">
          {done}/{total}
        </p>
      </div>
      <div
        className="connect-enhancement__progress-track"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness for matching"
      >
        <div className="connect-enhancement__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="connect-enhancement__lead">
        Quick Profile updates help us curate stronger connections.
      </p>
      <ul className="connect-enhancement__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="connect-enhancement__row"
              onClick={() => onItemClick(item)}
            >
              <span className="connect-enhancement__dot" aria-hidden />
              <span className="connect-enhancement__label">{item.label}</span>
              <span className="connect-enhancement__chev" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="connect-enhancement__actions">
        <button type="button" className="connect-enhancement__profile-btn" onClick={onOpenProfile}>
          Go to Profile
        </button>
        <button type="button" className="connect-enhancement__dismiss" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
