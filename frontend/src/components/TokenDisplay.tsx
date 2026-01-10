import { useState, useEffect } from "react";
import { api } from "../utils/api";

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
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
      console.log('✅ Tokens fetched:', tokenData);
    } catch (err) {
      console.error('❌ Failed to fetch tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    }
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (claiming) {
      console.log('⚠️ Already claiming, ignoring click');
      return;
    }
    
    if (!data?.canClaimWeeklyToken) {
      console.log('⚠️ Cannot claim weekly token - canClaimWeeklyToken is false');
      setError('You cannot claim weekly tokens right now. You may have already claimed this week or already have 3 tokens.');
      setTimeout(() => setError(""), 5000);
      return;
    }
    
    console.log('🔄 Attempting to claim weekly tokens...');
    setClaiming(true);
    setError("");
    setSuccess("");
    
    try {
      const result = await api.post<{ message: string; tokensGranted: number }>("/tokens/claim", {});
      console.log('✅ Claim successful:', result);
      
      setSuccess(result.message || `${result.tokensGranted} token(s) claimed successfully!`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);
      
      // Refresh token data
      await fetchTokens();
    } catch (err) {
      console.error('❌ Claim error:', err);
      
      // Extract error message
      let errorMessage = 'Failed to claim tokens. Please try again.';
      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
        
        // Handle ApiError with status property
        if ('status' in err) {
          const apiErr = err as Error & { status: number };
          if (apiErr.status === 400) {
            // Bad request - specific error message from backend
            errorMessage = err.message || 'Cannot claim tokens. You may have already claimed this week or already have 3 tokens.';
          } else if (apiErr.status === 401) {
            errorMessage = 'Session expired. Please log in again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
      }
      
      setError(errorMessage);
      
      // Clear error after 8 seconds
      setTimeout(() => setError(""), 8000);
    } finally {
      setClaiming(false);
    }
  };

  if (!data) {
    return (
      <div className="token-display">
        <div className="token-loading">Loading tokens...</div>
      </div>
    );
  }

  return (
    <div className="token-display">
      <div className="token-count">
        <span className="token-icon-large">🎟️</span>
        <span className="token-number">{data.availableTokens}</span>
        <span className="token-label">
          Mulligan Token{data.availableTokens !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="token-error" style={{
          color: 'var(--error-color, #ef4444)',
          fontSize: '0.85rem',
          padding: 'var(--space-2)',
          background: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '4px',
          marginTop: 'var(--space-2)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="token-success" style={{
          color: 'var(--success-color, #10b981)',
          fontSize: '0.85rem',
          padding: 'var(--space-2)',
          background: 'rgba(16, 185, 129, 0.1)',
          borderRadius: '4px',
          marginTop: 'var(--space-2)',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          ✅ {success}
        </div>
      )}

      {data.canClaimWeeklyToken ? (
        <button
          className="btn btn-primary btn-sm claim-btn"
          onClick={handleClaim}
          disabled={claiming}
          type="button"
          style={{
            cursor: claiming ? 'wait' : 'pointer',
            opacity: claiming ? 0.6 : 1,
            position: 'relative',
            zIndex: 2,
            pointerEvents: 'auto'
          }}
        >
          {claiming ? "Claiming..." : "✨ Claim Weekly Tokens"}
        </button>
      ) : (
        <div className="token-cannot-claim" style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          padding: 'var(--space-2)',
          fontStyle: 'italic'
        }}>
          {data.availableTokens >= 3 
            ? "You already have 3 tokens. Use them to connect with people!"
            : "You can claim 3 tokens next week!"
          }
        </div>
      )}

      <p className="token-info">
        Use tokens to connect with people. Get 3 new tokens each week!
      </p>
    </div>
  );
}

