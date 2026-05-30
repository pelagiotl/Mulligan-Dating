type Props = {
  open: boolean;
  slotLimit: number;
  onClose: () => void;
};

export default function MatchLimitModalWeb({ open, slotLimit, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="match-limit-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-limit-modal-title"
      onClick={onClose}
    >
      <div className="match-limit-modal-card" onClick={(e) => e.stopPropagation()}>
        <p className="match-limit-modal-emoji" aria-hidden>
          🎯
        </p>
        <h2 id="match-limit-modal-title" className="match-limit-modal-title">
          Connection limit reached
        </h2>
        <p className="match-limit-modal-body">
          You&apos;ve reached your limit of {slotLimit} active connections. To connect with someone
          new:
        </p>
        <ul className="match-limit-modal-list">
          <li>Unmatch with someone to free a slot</li>
          <li>Wait for a connection to expire (7-day limit)</li>
        </ul>
        <button type="button" className="btn btn-primary match-limit-modal-btn" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
