import type { ConnectShellMode } from "../lib/connectShellTheme";

type Props = {
  shell: ConnectShellMode;
};

/** Animated ❤️ beside “Your Matches” — mirrors Android Matches tab header heart. */
export default function MatchesHeaderHeartIcon({ shell }: Props) {
  return (
    <span
      className={`matches-header-heart matches-header-heart--${shell}`}
      aria-hidden
    >
      <span className="matches-header-heart__glow" />
      <span className="matches-header-heart__badge">
        <span className="matches-header-heart__gradient" />
        <span className="matches-header-heart__shimmer" />
        <span className="matches-header-heart__emoji">❤️</span>
      </span>
    </span>
  );
}
