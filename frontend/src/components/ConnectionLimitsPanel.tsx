import { TOKEN_MAX } from "../constants/tokens";
import { DEFAULT_MATCH_SLOT_LIMIT } from "../constants/matchSlots";
import type { ConnectionLimitsState } from "../hooks/useConnectionLimits";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Any moment now";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

type Props = Pick<
  ConnectionLimitsState,
  | "loading"
  | "availableTokens"
  | "canClaimWeeklyToken"
  | "nextRefillDate"
  | "activeMatches"
  | "slotLimit"
>;

export default function ConnectionLimitsPanel({
  loading,
  availableTokens,
  canClaimWeeklyToken,
  nextRefillDate,
  activeMatches,
  slotLimit,
}: Props) {
  const tokensReady = Math.min(Math.max(0, availableTokens), TOKEN_MAX);
  const limit = slotLimit || DEFAULT_MATCH_SLOT_LIMIT;
  const slotsOpen = Math.max(0, limit - activeMatches);
  const atCapacity = activeMatches >= limit;

  const refillMs =
    nextRefillDate && !canClaimWeeklyToken
      ? new Date(nextRefillDate).getTime() - Date.now()
      : null;
  const showRefill =
    refillMs != null && refillMs > 0 && !canClaimWeeklyToken && tokensReady < TOKEN_MAX;

  if (loading) {
    return (
      <div className="connection-limits-panel connection-limits-panel--loading" aria-busy="true">
        <span className="connection-limits-panel__spinner" aria-hidden />
        <span>Loading your Mulligans &amp; connections…</span>
      </div>
    );
  }

  return (
    <section className="connection-limits-panel" aria-label="Mulligans and connection limits">
      <div className="connection-limits-panel__head">
        <span className="connection-limits-panel__eyebrow">Your limits</span>
        <p className="connection-limits-panel__lede">
          <strong>{TOKEN_MAX} Mulligans per week</strong> for Connects you send.{" "}
          <strong>{limit} active connections</strong> at once (including ones who Connect with you).
        </p>
      </div>

      <div className="connection-limits-panel__tiles">
        <div className="connection-limits-panel__tile connection-limits-panel__tile--tokens">
          <span className="connection-limits-panel__tile-label">Mulligans ready</span>
          <span className="connection-limits-panel__tile-value">
            {tokensReady}
            <span className="connection-limits-panel__tile-denom"> / {TOKEN_MAX}</span>
          </span>
          <span className="connection-limits-panel__tile-hint">Weekly refill · 1 per Connect you send</span>
        </div>
        <div
          className={`connection-limits-panel__tile connection-limits-panel__tile--slots${
            atCapacity ? " connection-limits-panel__tile--full" : ""
          }`}
        >
          <span className="connection-limits-panel__tile-label">Active connections</span>
          <span className="connection-limits-panel__tile-value">
            {activeMatches}
            <span className="connection-limits-panel__tile-denom"> / {limit}</span>
          </span>
          <span className="connection-limits-panel__tile-hint">
            {atCapacity
              ? "At capacity — unmatch or wait for 7-day expiry"
              : `${slotsOpen} slot${slotsOpen === 1 ? "" : "s"} open`}
          </span>
        </div>
      </div>

      {canClaimWeeklyToken && tokensReady < TOKEN_MAX ? (
        <p className="connection-limits-panel__note">
          Weekly Mulligans are ready — claim them on the Connect tab when you want to reach out.
        </p>
      ) : null}
      {showRefill && refillMs != null ? (
        <p className="connection-limits-panel__note">
          Next Mulligan refill in <strong>{formatCountdown(refillMs)}</strong>
        </p>
      ) : null}
      {atCapacity ? (
        <p className="connection-limits-panel__note connection-limits-panel__note--capacity">
          You&apos;re at {limit} active connections. Unmatch someone or wait for a connection to expire
          to free a slot.
        </p>
      ) : null}
    </section>
  );
}
