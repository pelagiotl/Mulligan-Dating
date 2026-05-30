import type { CSSProperties } from "react";

type Props = {
  /** Stagger flip/glow/sand so cards don’t animate in sync. */
  delayMs?: number;
};

/** Animated ⏳ for match expiry — same flip/glow/sand as launch countdown, sized for cards. */
export default function MatchExpiryHourglass({ delayMs = 0 }: Props) {
  return (
    <span
      className="match-expiry-hourglass"
      aria-hidden
      style={
        delayMs > 0
          ? ({ "--match-hourglass-delay": `${delayMs}ms` } as CSSProperties)
          : undefined
      }
    >
      <span className="match-expiry-hourglass__emoji">⏳</span>
      <span className="match-expiry-hourglass__sand" />
    </span>
  );
}
