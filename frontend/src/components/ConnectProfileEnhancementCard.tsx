import type { CSSProperties } from "react";
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
      <div className="connect-enhancement__glow" aria-hidden />
      <div className="connect-enhancement__accent connect-enhancement__accent--animated" aria-hidden />
      <div className="connect-enhancement__head">
        <div className="connect-enhancement__title-wrap">
          <span className="connect-enhancement__icon connect-enhancement__icon--pulse" aria-hidden>
            ✨
          </span>
          <p className="connect-enhancement__eyebrow">Better matches</p>
        </div>
        <p className="connect-enhancement__progress connect-enhancement__progress--pop" aria-live="polite">
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
        <div
          className="connect-enhancement__progress-fill connect-enhancement__progress-fill--animated"
          style={{ "--enhancement-progress": `${progressPct}%` } as CSSProperties}
        />
      </div>
      <p className="connect-enhancement__lead connect-enhancement__lead--fade">
        Quick Profile updates help us curate stronger connections.
      </p>
      <ul className="connect-enhancement__list">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="connect-enhancement__list-item"
            style={{ "--enhancement-stagger": `${index}` } as CSSProperties}
          >
            <button
              type="button"
              className="connect-enhancement__row"
              onClick={() => onItemClick(item)}
            >
              <span className="connect-enhancement__dot connect-enhancement__dot--pulse" aria-hidden />
              <span className="connect-enhancement__label">{item.label}</span>
              <span className="connect-enhancement__chev connect-enhancement__chev--nudge" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="connect-enhancement__actions connect-enhancement__actions--fade">
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
