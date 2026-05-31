import { useCallback, useState } from "react";
import { TOKEN_MAX } from "../constants/tokens";
import { effectiveConnectionSlotLimit } from "../constants/matchSlots";
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
    const v = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
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
  const limit = effectiveConnectionSlotLimit(slotLimit);
  const slotsOpen = Math.max(0, limit - activeMatches);
  const atCapacity = activeMatches >= limit;
  const tokenPct = Math.round((tokensReady / TOKEN_MAX) * 100);
  const slotPct = Math.min(100, Math.round((activeMatches / limit) * 100));

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
          <span className="connection-limits-panel__reveal-gem" aria-hidden>
            ✦
          </span>
          <span className="connection-limits-panel__reveal-label">Limits</span>
          <span className="connection-limits-panel__reveal-stats" aria-hidden>
            <span className="connection-limits-panel__reveal-stat">
              <span className="connection-limits-panel__reveal-icon connection-limits-panel__reveal-icon--ticket">
                🎟
              </span>
              {tokensReady}/{TOKEN_MAX}
            </span>
            <span className="connection-limits-panel__reveal-divider" />
            <span
              className={`connection-limits-panel__reveal-stat${
                atCapacity ? " connection-limits-panel__reveal-stat--full" : ""
              }`}
            >
              <span className="connection-limits-panel__reveal-icon connection-limits-panel__reveal-icon--heart">
                💞
              </span>
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
      <div className="connection-limits-panel__accent" aria-hidden />

      <div className="connection-limits-panel__toolbar">
        <div className="connection-limits-panel__title-group">
          <span className="connection-limits-panel__eyebrow">Limits</span>
          <p className="connection-limits-panel__lede">
            {TOKEN_MAX} Mulligans weekly · {limit} connections max
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
        <article className="connection-limits-panel__metric connection-limits-panel__metric--tokens">
          <div
            className="connection-limits-panel__metric-icon-wrap connection-limits-panel__metric-icon-wrap--ticket"
            aria-hidden
          >
            <span className="connection-limits-panel__metric-icon-emoji">🎟</span>
          </div>
          <div className="connection-limits-panel__metric-content">
            <span className="connection-limits-panel__metric-label">Mulligans</span>
            <p className="connection-limits-panel__metric-value">
              {tokensReady}
              <span className="connection-limits-panel__metric-denom"> / {TOKEN_MAX}</span>
            </p>
            <div
              className="connection-limits-panel__metric-track"
              role="progressbar"
              aria-valuenow={tokensReady}
              aria-valuemin={0}
              aria-valuemax={TOKEN_MAX}
              aria-label={`${tokensReady} of ${TOKEN_MAX} Mulligans`}
            >
              <span
                className="connection-limits-panel__metric-fill connection-limits-panel__metric-fill--tokens"
                style={{ width: `${tokenPct}%` }}
              />
            </div>
          </div>
        </article>

        <article
          className={`connection-limits-panel__metric connection-limits-panel__metric--slots${
            atCapacity ? " connection-limits-panel__metric--full" : ""
          }`}
        >
          <div
            className="connection-limits-panel__metric-icon-wrap connection-limits-panel__metric-icon-wrap--heart"
            aria-hidden
          >
            <span className="connection-limits-panel__metric-icon-emoji">💞</span>
          </div>
          <div className="connection-limits-panel__metric-content">
            <span className="connection-limits-panel__metric-label">Connections</span>
            <p className="connection-limits-panel__metric-value">
              {activeMatches}
              <span className="connection-limits-panel__metric-denom"> / {limit}</span>
            </p>
            <div
              className="connection-limits-panel__metric-track"
              role="progressbar"
              aria-valuenow={activeMatches}
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-label={`${activeMatches} of ${limit} active connections`}
            >
              <span
                className={`connection-limits-panel__metric-fill connection-limits-panel__metric-fill--slots${
                  atCapacity ? " connection-limits-panel__metric-fill--full" : ""
                }`}
                style={{ width: `${slotPct}%` }}
              />
            </div>
            {!atCapacity ? (
              <span className="connection-limits-panel__metric-chip">
                {slotsOpen} slot{slotsOpen === 1 ? "" : "s"} available
              </span>
            ) : null}
          </div>
        </article>
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
