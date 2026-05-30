import { useCallback, useState } from "react";
import { TOKEN_MAX } from "../constants/tokens";
import { DEFAULT_MATCH_SLOT_LIMIT } from "../constants/matchSlots";
import type { ConnectionLimitsState } from "../hooks/useConnectionLimits";

const COLLAPSED_STORAGE_KEY = "mulligan_matches_limits_panel_collapsed";

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

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
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
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const persistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

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

  const statusNote = atCapacity
    ? `At ${limit} connections — unmatch or wait for expiry`
    : canClaimWeeklyToken && tokensReady < TOKEN_MAX
      ? "Weekly Mulligans ready on Connect"
      : showRefill && refillMs != null
        ? `Next Mulligan in ${formatCountdown(refillMs)}`
        : null;

  if (loading) {
    return (
      <div className="connection-limits-panel connection-limits-panel--loading" aria-busy="true">
        <span className="connection-limits-panel__spinner" aria-hidden />
        <span>Loading limits…</span>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="connection-limits-panel connection-limits-panel--collapsed">
        <button
          type="button"
          className="connection-limits-panel__reveal"
          onClick={() => persistCollapsed(false)}
          aria-expanded={false}
          aria-controls="connection-limits-panel-body"
        >
          <span className="connection-limits-panel__reveal-label">Your limits</span>
          <span className="connection-limits-panel__reveal-stats" aria-hidden>
            <span className="connection-limits-panel__reveal-stat">
              <span className="connection-limits-panel__reveal-icon">🎟</span>
              {tokensReady}/{TOKEN_MAX}
            </span>
            <span className="connection-limits-panel__reveal-divider" />
            <span
              className={`connection-limits-panel__reveal-stat${
                atCapacity ? " connection-limits-panel__reveal-stat--full" : ""
              }`}
            >
              <span className="connection-limits-panel__reveal-icon">💞</span>
              {activeMatches}/{limit}
            </span>
          </span>
          <span className="connection-limits-panel__reveal-action">Show</span>
        </button>
      </div>
    );
  }

  return (
    <section
      id="connection-limits-panel-body"
      className="connection-limits-panel"
      aria-label="Mulligans and connection limits"
    >
      <div className="connection-limits-panel__toolbar">
        <div className="connection-limits-panel__title-group">
          <span className="connection-limits-panel__eyebrow">Your limits</span>
          <p className="connection-limits-panel__lede">
            {TOKEN_MAX} Mulligans / week · {limit} active connections max
          </p>
        </div>
        <button
          type="button"
          className="connection-limits-panel__hide"
          onClick={() => persistCollapsed(true)}
          aria-expanded={true}
          aria-controls="connection-limits-panel-body"
        >
          Hide
        </button>
      </div>

      <div className="connection-limits-panel__metrics">
        <div className="connection-limits-panel__metric connection-limits-panel__metric--tokens">
          <span className="connection-limits-panel__metric-icon" aria-hidden>
            🎟
          </span>
          <div className="connection-limits-panel__metric-body">
            <span className="connection-limits-panel__metric-label">Mulligans</span>
            <span className="connection-limits-panel__metric-value">
              {tokensReady}
              <span className="connection-limits-panel__metric-denom">/{TOKEN_MAX}</span>
            </span>
          </div>
        </div>
        <div
          className={`connection-limits-panel__metric connection-limits-panel__metric--slots${
            atCapacity ? " connection-limits-panel__metric--full" : ""
          }`}
        >
          <span className="connection-limits-panel__metric-icon" aria-hidden>
            💞
          </span>
          <div className="connection-limits-panel__metric-body">
            <span className="connection-limits-panel__metric-label">Connections</span>
            <span className="connection-limits-panel__metric-value">
              {activeMatches}
              <span className="connection-limits-panel__metric-denom">/{limit}</span>
            </span>
          </div>
          {!atCapacity ? (
            <span className="connection-limits-panel__metric-badge">
              {slotsOpen} open
            </span>
          ) : null}
        </div>
      </div>

      {statusNote ? (
        <p
          className={`connection-limits-panel__note${
            atCapacity ? " connection-limits-panel__note--capacity" : ""
          }`}
        >
          {statusNote}
        </p>
      ) : null}
    </section>
  );
}
