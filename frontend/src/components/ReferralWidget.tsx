import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../utils/api";

interface ReferralWidgetData {
  referralCode: string;
  referralLink: string;
  tokensEarned: number;
}

export default function ReferralWidget() {
  const [data, setData] = useState<ReferralWidgetData | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const referralData = await api.get<ReferralWidgetData>("/referrals");
      setData({
        referralCode: referralData.referralCode,
        referralLink: referralData.referralLink,
        tokensEarned: referralData.tokensEarned,
      });
    } catch {
      // Ignore errors
    }
  };

  const copyLink = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareLink = async () => {
    if (!data) return;

    const shareData = {
      title: "Join me on Mulligan!",
      text: "I'm using Mulligan to find meaningful connections. Join me and we'll both get rewards!",
      url: data.referralLink,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          copyLink();
        }
      }
    } else {
      copyLink();
    }
  };

  if (!data) return null;

  return (
    <div className="referral-widget">
      <div className="referral-widget-header" onClick={() => setExpanded(!expanded)}>
        <div className="referral-widget-title">
          <span className="referral-widget-icon">🎁</span>
          <span>
            Refer Friends
            {data.tokensEarned > 0 && (
              <span className="referral-widget-badge">{data.tokensEarned} earned</span>
            )}
          </span>
        </div>
        <span className="referral-widget-toggle">{expanded ? "−" : "+"}</span>
      </div>

      {expanded && (
        <div className="referral-widget-content">
          <p className="referral-widget-description">
            Share your referral link and earn a free mulligan for each friend who signs up!
          </p>
          
          <div className="referral-widget-code">
            <span className="referral-widget-code-label">Your Code:</span>
            <span className="referral-widget-code-value">{data.referralCode}</span>
          </div>

          <div className="referral-widget-actions">
            <button className="btn btn-primary btn-sm" onClick={shareLink}>
              {copied ? "✓ Copied!" : "📤 Share Link"}
            </button>
            <Link to="/referrals" className="btn btn-secondary btn-sm">
              View Details
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}





