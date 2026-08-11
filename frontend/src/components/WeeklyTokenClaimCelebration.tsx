import { useEffect } from "react";

type Props = {
  tokensGranted: number;
  onDismiss: () => void;
};

export default function WeeklyTokenClaimCelebration({ tokensGranted, onDismiss }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  const n = Math.max(1, Math.floor(tokensGranted));

  return (
    <div className="weekly-token-celebration" role="status" aria-live="polite">
      <span className="weekly-token-celebration-emoji" aria-hidden>
        🎟️
      </span>
      <div className="weekly-token-celebration-copy">
        <p className="weekly-token-celebration-title">Monthly refill claimed</p>
        <p className="weekly-token-celebration-sub">
          {n} token{n !== 1 ? "s" : ""} added — you&apos;re ready to connect.
        </p>
      </div>
    </div>
  );
}
