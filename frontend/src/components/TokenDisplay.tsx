import { useState, useEffect } from "react";
import { api } from "../utils/api";

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
}

export default function TokenDisplay() {
  const [data, setData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const tokenData = await api.get<TokenData>("/tokens");
      setData(tokenData);
    } catch {
      // Ignore errors
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await api.post("/tokens/claim", {});
      await fetchTokens();
    } catch {
      // Ignore errors
    } finally {
      setClaiming(false);
    }
  };

  if (!data) return null;

  return (
    <div className="token-display">
      <div className="token-count">
        <span className="token-icon-large">🎟️</span>
        <span className="token-number">{data.availableTokens}</span>
        <span className="token-label">
          Mulligan Token{data.availableTokens !== 1 ? "s" : ""}
        </span>
      </div>

      {data.canClaimWeeklyToken && (
        <button
          className="btn btn-primary btn-sm claim-btn"
          onClick={handleClaim}
          disabled={claiming}
        >
          {claiming ? "Claiming..." : "✨ Claim Weekly Tokens"}
        </button>
      )}

      <p className="token-info">
        Use tokens to connect with people. Get 3 new tokens each week!
      </p>
    </div>
  );
}

