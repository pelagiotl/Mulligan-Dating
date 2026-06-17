/** Chat header entry point for Smart Intentional Date Planner — always available. */
export default function HangoutPlanHeaderButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      className="tod-web-header-btn"
      title="Smart hangout ideas"
      aria-label="Smart hangout ideas"
      onClick={onPress}
    >
      <span className="tod-web-header-emoji">📅</span>
    </button>
  );
}
