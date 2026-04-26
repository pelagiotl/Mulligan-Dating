import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { TOKEN_MAX } from "../constants/tokens";
import { emitTokenBalanceUpdated } from "../lib/tokenBalanceEvents";

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

export default function TokenDisplay() {
  const [data, setData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

      setSuccess(result.message || `${result.tokensGranted} token(s) claimed successfully!`);

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

  if (!data) {
    return (
      <div className="token-display token-display-card">
        <div className="token-display-loading">Loading tokens...</div>
      </div>
    );
  }

  const refillFormatted = formatRefillDate(data.nextRefillDate);
  const meterPct = Math.min(100, (data.availableTokens / TOKEN_MAX) * 100);

  const cannotClaimMessage =
    data.availableTokens >= TOKEN_MAX
      ? `You're at your maximum of ${TOKEN_MAX} tokens. Use them to connect with people!`
      : refillFormatted
        ? `Next weekly refill: ${refillFormatted}. You'll get up to ${TOKEN_MAX} tokens.`
        : "Weekly tokens aren't ready to claim yet. Check back after your refill date.";

  return (
    <div className="token-display token-display-card">
      <div className="token-display-header-gradient">
        <div className="token-display-header-inner">
          <span className="token-display-header-emoji" aria-hidden>
            🎟️
          </span>
          <div className="token-display-header-count-row">
            <span className="token-display-header-number">{data.availableTokens}</span>
            <span className="token-display-header-cap">/ {TOKEN_MAX}</span>
          </div>
          <p className="token-display-header-label">
            Mulligan Token{data.availableTokens !== 1 ? "s" : ""} available
          </p>
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

        {data.canClaimWeeklyToken ? (
          <button
            className="btn btn-primary btn-sm claim-btn token-display-claim-gradient"
            onClick={handleClaim}
            disabled={claiming}
            type="button"
          >
            {claiming ? "Claiming..." : "✨ Claim Weekly Tokens"}
          </button>
        ) : (
          <div className="token-cannot-claim">{cannotClaimMessage}</div>
        )}

        <p className="token-info token-display-footer-hint">
          Use tokens to connect with people. Get {TOKEN_MAX} tokens weekly (up to {TOKEN_MAX} max).
        </p>
      </div>
    </div>
  );
}
