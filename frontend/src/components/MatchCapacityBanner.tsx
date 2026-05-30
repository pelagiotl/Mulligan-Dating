import { Link } from "react-router-dom";

type Props = {
  slotLimit: number;
  /** When true, adds a link to Matches to manage connections. */
  showManageLink?: boolean;
  className?: string;
};

export default function MatchCapacityBanner({
  slotLimit,
  showManageLink = true,
  className = "",
}: Props) {
  return (
    <div
      className={`match-capacity-banner ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className="match-capacity-banner__title">You&apos;re at capacity</p>
      <p className="match-capacity-banner__body">
        You have {slotLimit} active connections — the maximum right now. Unmatch with someone
        or wait for a connection to expire after 7 days to connect with someone new.
      </p>
      {showManageLink ? (
        <Link to="/matches" className="match-capacity-banner__link">
          View your connections
        </Link>
      ) : null}
    </div>
  );
}
