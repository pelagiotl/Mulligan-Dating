import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";
import { TOKEN_MAX } from "../constants/tokens";
import { emitTokenBalanceUpdated } from "../lib/tokenBalanceEvents";
import WeeklyTokenClaimCelebration from "./WeeklyTokenClaimCelebration";
import { playTokenClaimSound, unlockTokenClaimAudio } from "../utils/tokenClaimSound";

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate?: string | null;
}

function formatRefillDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function formatRefillShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

interface TokenDisplayProps {
  /** Tighter copy and spacing when shown inside the navbar token dialog. */
  variant?: "default" | "modalCompact";
}

export default function TokenDisplay({ variant = "default" }: TokenDisplayProps) {
  const [data, setData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [claimCelebration, setClaimCelebration] = useState<{ tokensGranted: number } | null>(null);
  const dismissClaimCelebration = useCallback(() => setClaimCelebration(null), []);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      setError("");
      const tokenData = await api.get<TokenData>("/tokens");
      setData(tokenData);
      emitTokenBalanceUpdated(tokenData.availableTokens);
      console.log("✅ Tokens fetched:", tokenData);
    } catch (err) {
      console.error("❌ Failed to fetch tokens:", err);
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    }
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (claiming) {
      console.log("⚠️ Already claiming, ignoring click");
      return;
    }

    if (!data?.canClaimWeeklyToken) {
      console.log("⚠️ Cannot claim weekly token - canClaimWeeklyToken is false");
      setError(
        `You cannot claim weekly tokens right now. You may have already claimed this week or already have ${TOKEN_MAX} tokens.`
      );
      setTimeout(() => setError(""), 5000);
      return;
    }

    console.log("🔄 Attempting to claim weekly tokens...");
    setClaiming(true);
    setError("");
    setSuccess("");

    try {
      const result = await api.post<{ message: string; tokensGranted: number }>("/tokens/claim", {});
      console.log("✅ Claim successful:", result);

      const granted = result.tokensGranted ?? 0;
      setSuccess(result.message || `${granted} token(s) claimed successfully!`);
      if (granted > 0) {
        playTokenClaimSound();
        setClaimCelebration({ tokensGranted: granted });
      }

      setTimeout(() => setSuccess(""), 3000);

      await fetchTokens();
    } catch (err) {
      console.error("❌ Claim error:", err);

      let errorMessage = "Failed to claim tokens. Please try again.";
      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;

        if ("status" in err) {
          const apiErr = err as Error & { status: number };
          if (apiErr.status === 400) {
            errorMessage =
              err.message ||
              `Cannot claim tokens. You may have already claimed this week or already have ${TOKEN_MAX} tokens.`;
          } else if (apiErr.status === 401) {
            errorMessage = "Session expired. Please log in again.";
          } else if (apiErr.status === 408) {
            errorMessage = "Request timed out. The server may be slow. Please try again.";
          }
        }
      }

      setError(errorMessage);

      setTimeout(() => setError(""), 8000);
    } finally {
      setClaiming(false);
    }
  };

  const compact = variant === "modalCompact";

  if (!data) {
    return (
      <div
        className={`token-display token-display-card token-display--pending${compact ? " token-display--modal-compact" : ""}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading Mulligan tokens"
      >
        <div className="token-display-header-gradient">
          <div className="token-display-header-inner">
            <span
              className={`token-display-header-emoji${compact ? " token-display-header-emoji--compact" : ""}`}
              aria-hidden
            >
              🎟️
            </span>
            <div className="token-display-header-count-row">
              <span className="token-display-header-number token-display-skeleton-bar" aria-hidden />
              <span className="token-display-header-cap">/ {TOKEN_MAX}</span>
            </div>
            {!compact ? (
              <p className="token-display-header-label">Mulligan Tokens</p>
            ) : null}
            <div className="token-display-meter" aria-hidden>
              <div className="token-display-meter-fill" style={{ width: "0%" }} />
            </div>
          </div>
        </div>
        <div className="token-display-body">
          <div className="token-display-skeleton-bar token-display-skeleton-bar--wide" aria-hidden />
        </div>
      </div>
    );
  }

  const refillFormatted = formatRefillDate(data.nextRefillDate);
  const refillShort = formatRefillShort(data.nextRefillDate);
  const meterPct = Math.min(100, (data.availableTokens / TOKEN_MAX) * 100);

  const cannotClaimFull =
    data.availableTokens >= TOKEN_MAX
      ? `You're at your maximum of ${TOKEN_MAX} tokens. Use them to match with people!`
      : refillFormatted
        ? `Next weekly refill: ${refillFormatted}. You'll get up to ${TOKEN_MAX} tokens.`
        : "Weekly tokens aren't ready to claim yet. Check back after your refill date.";

  const cannotClaimCompact =
    data.availableTokens >= TOKEN_MAX
      ? `${TOKEN_MAX}/${TOKEN_MAX} — use Connect to spend`
      : refillShort
        ? `Next refill · ${refillShort}`
        : "Not ready to claim yet";

  const cannotClaimMessage = compact ? cannotClaimCompact : cannotClaimFull;

  return (
    <div
      className={`token-display token-display-card${compact ? " token-display--modal-compact" : ""}`}
    >
      <div className="token-display-header-gradient">
        <div className="token-display-header-inner">
          <span
            className={`token-display-header-emoji${compact ? " token-display-header-emoji--compact" : ""}`}
            aria-hidden
          >
            🎟️
          </span>
          <div className="token-display-header-count-row">
            <span className="token-display-header-number">{data.availableTokens}</span>
            <span className="token-display-header-cap">/ {TOKEN_MAX}</span>
          </div>
          {!compact ? (
            <p className="token-display-header-label">
              Mulligan Token{data.availableTokens !== 1 ? "s" : ""} available
            </p>
          ) : null}
          <div className="token-display-meter" aria-hidden>
            <div className="token-display-meter-fill" style={{ width: `${meterPct}%` }} />
          </div>
        </div>
      </div>

      <div className="token-display-body">
        {error && (
          <div className="token-error">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="token-success">
            ✅ {success}
          </div>
        )}

        {claimCelebration ? (
          <WeeklyTokenClaimCelebration
            tokensGranted={claimCelebration.tokensGranted}
            onDismiss={dismissClaimCelebration}
          />
        ) : null}

        {data.canClaimWeeklyToken ? (
          <button
            className="btn btn-primary btn-sm claim-btn token-display-claim-gradient"
            onPointerDown={unlockTokenClaimAudio}
            onClick={handleClaim}
            disabled={claiming}
            type="button"
          >
            {claiming ? "Claiming…" : compact ? "Claim weekly refill" : "✨ Claim Weekly Tokens"}
          </button>
        ) : (
          <div className={`token-cannot-claim${compact ? " token-cannot-claim--compact" : ""}`}>
            {cannotClaimMessage}
          </div>
        )}
      </div>
    </div>
  );
}
