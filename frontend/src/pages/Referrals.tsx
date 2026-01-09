import { useState, useEffect, useRef } from "react";
import { api } from "../utils/api";

interface ReferralData {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  tokensEarned: number;
  referrals: Array<{
    id: string;
    referredEmail: string;
    referredName: string | null;
    createdAt: string;
    tokenGranted: boolean;
  }>;
}

export default function Referrals() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedItem, setCopiedItem] = useState<'code' | 'link' | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset state when component mounts
    setLoading(true);
    fetchReferrals();

    // Cleanup: cancel any pending requests when component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchReferrals = async () => {
    try {
      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      const referralData = await api.get<ReferralData>("/referrals");
      
      // Check if component is still mounted (request wasn't aborted)
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Ensure referral link uses current origin (in case backend guessed wrong)
      if (referralData.referralLink && !referralData.referralLink.startsWith(window.location.origin)) {
        const url = new URL(referralData.referralLink);
        referralData.referralLink = `${window.location.origin}${url.pathname}${url.search}`;
      }
      setData(referralData);
    } catch (err: any) {
      // Ignore aborted requests
      if (err?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return;
      }
      console.error("Failed to fetch referrals:", err);
      // Keep loading false so error state shows
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const copyToClipboard = async (text: string, item: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopiedItem(item);
      setTimeout(() => {
        setCopied(false);
        setCopiedItem(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareReferralLink = async () => {
    if (!data) return;

    const shareText = "I'm using Mulligan to find meaningful connections. Join me and we'll both get rewards!";
    
    // Check if Web Share API is available
    if (navigator.share) {
      const shareData: ShareData = {
        title: "Join me on Mulligan!",
        text: shareText,
        url: data.referralLink,
      };

      // Check if we can share this data
      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          // If share succeeds, don't copy - user shared via native dialog
          return;
        } catch (err) {
          // User cancelled - don't show error or copy
          if ((err as Error).name === 'AbortError') {
            return;
          }
          // Other error - fall through to copy
          console.error("Share failed:", err);
        }
      } else {
        // Can't share this data format, try with just URL
        try {
          await navigator.share({
            url: data.referralLink,
            text: shareText,
          });
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            return;
          }
        }
      }
    }

    // Fallback: copy to clipboard if native sharing not available or failed
    copyToClipboard(data.referralLink, 'link');
  };

  const shareViaEmail = () => {
    if (!data) return;
    const subject = encodeURIComponent("Join me on Mulligan!");
    const body = encodeURIComponent(
      `Hi!\n\nI'm using Mulligan to find meaningful connections. Join me and we'll both get rewards!\n\nUse my referral code: ${data.referralCode}\n\nOr sign up here: ${data.referralLink}\n\nLooking forward to connecting with you!`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareViaTwitter = () => {
    if (!data) return;
    const text = encodeURIComponent(
      `I'm using Mulligan to find meaningful connections! Join me and we'll both get rewards: ${data.referralLink}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'width=550,height=420');
  };

  const shareViaFacebook = () => {
    if (!data) return;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.referralLink)}`,
      '_blank',
      'width=550,height=420'
    );
  };

  if (loading) {
    return (
      <div className="loading-screen">Loading your referrals...</div>
    );
  }

  if (!data) {
    return (
      <div className="no-profiles">
        <div className="no-profiles-icon">😕</div>
        <p>Failed to load referral data</p>
      </div>
    );
  }

  return (
      <div className="referrals-page">
        <div className="referrals-header">
          <div className="referrals-header-content">
            <h1 className="referrals-title-immersive">
              <span className="title-word title-word-1">Refer</span>
              <span className="title-word title-word-2">Friends,</span>
              <span className="title-word title-word-3">Get</span>
              <span className="title-word title-word-4">Mulligans</span>
            </h1>
            <p className="referrals-subtitle-immersive">
              Share Mulligan with your friends and earn a free mulligan token for
              each friend who signs up!
            </p>
            <div className="referrals-sparkles">
              <span className="sparkle-icon sparkle-1">✨</span>
              <span className="sparkle-icon sparkle-2">🎁</span>
              <span className="sparkle-icon sparkle-3">💎</span>
              <span className="sparkle-icon sparkle-4">⭐</span>
            </div>
          </div>
        </div>

        <div className="referral-card">
          <div className="referral-code-section">
            <h2>Your Referral Code</h2>
            <div className="referral-code-display">
              <span className="referral-code-value">{data.referralCode}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(data.referralCode, 'code')}
              >
                {copied && copiedItem === 'code' ? "✓ Copied!" : "Copy Code"}
              </button>
            </div>
            <p className="referral-hint">
              Share this code with friends - they can enter it when signing up!
            </p>
          </div>

          <div className="referral-link-section">
            <h3>Your Referral Link</h3>
            <div className="referral-link-display">
              <input
                type="text"
                readOnly
                value={data.referralLink}
                className="referral-link-input"
              />
              <button
                className="btn btn-secondary"
                onClick={() => copyToClipboard(data.referralLink, 'link')}
              >
                {copied && copiedItem === 'link' ? "✓ Copied!" : "Copy Link"}
              </button>
            </div>
            <div className="referral-share-buttons">
              {typeof navigator !== 'undefined' && 'share' in navigator && typeof (navigator as any).share === 'function' && (
                <button
                  className="btn btn-primary share-btn"
                  onClick={shareReferralLink}
                  title="Share via your device's share menu (works best on mobile)"
                >
                  📤 Share (Native)
                </button>
              )}
              <button
                className="btn btn-secondary share-btn"
                onClick={shareViaEmail}
              >
                📧 Email
              </button>
              <button
                className="btn btn-secondary share-btn"
                onClick={shareViaTwitter}
              >
                🐦 Twitter
              </button>
              <button
                className="btn btn-secondary share-btn"
                onClick={shareViaFacebook}
              >
                📘 Facebook
              </button>
            </div>
            <p className="referral-hint">
              Share your referral link via email, social media, or native sharing. When
              friends sign up, you'll both get rewards!
            </p>
          </div>
        </div>

        <div className="referral-stats">
          <div className="stat-card">
            <div className="stat-number">{data.totalReferrals}</div>
            <div className="stat-label">Friends Referred</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-number">{data.tokensEarned}</div>
            <div className="stat-label">Tokens Earned</div>
          </div>
        </div>

        {data.referrals.length > 0 && (
          <div className="referrals-list">
            <h2>Your Referrals</h2>
            <div className="referrals-table">
              {data.referrals.map((referral) => (
                <div key={referral.id} className="referral-item">
                  <div className="referral-info">
                    <div className="referral-name">
                      {referral.referredName || referral.referredEmail}
                    </div>
                    <div className="referral-date">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="referral-status">
                    {referral.tokenGranted ? (
                      <span className="status-badge success">✓ Token Earned</span>
                    ) : (
                      <span className="status-badge pending">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.referrals.length === 0 && (
          <div className="no-referrals">
            <div className="no-referrals-icon">👥</div>
            <h3>No referrals yet</h3>
            <p>Start sharing your referral link to earn free mulligan tokens!</p>
          </div>
        )}
      </div>
  );
}

