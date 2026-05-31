import { getMatchesSupportMailtoUrl, type MatchesSupportContext } from "../constants/support";

type Props = Pick<
  MatchesSupportContext,
  "userId" | "availableTokens" | "activeMatches" | "slotLimit"
> & {
  className?: string;
};

export default function MatchesSupportNote({
  userId,
  availableTokens,
  activeMatches,
  slotLimit,
  className,
}: Props) {
  const href = getMatchesSupportMailtoUrl({
    userId,
    surface: "web",
    availableTokens,
    activeMatches,
    slotLimit,
  });

  return (
    <p
      className={["matches-support-note", className].filter(Boolean).join(" ")}
    >
      Questions?{" "}
      <a
        href={href}
        className="matches-support-note__link"
        aria-label="Email Mulligan support"
      >
        Email support
      </a>
    </p>
  );
}
