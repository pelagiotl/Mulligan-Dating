import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getPhotoUrl } from "../utils/photoUrl";

const REVEAL_DELAY_MS = 7000;

interface MatchExplanation {
  reasons: string[];
}

interface MatchCelebrationProps {
  profileName: string;
  photoUrl?: string;
  onClose: () => void;
  matchId?: string | null;
  explanation?: MatchExplanation | null;
  /** Recipient flows can skip the “finding match” beat (web browse connect always passes matchId). */
  skipLoadingReveal?: boolean;
}

/**
 * Generate a firework sound effect using Web Audio API
 */
function playFireworkSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(200 + i * 50, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800 + i * 100, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        for (let j = 0; j < 5; j++) {
          setTimeout(() => {
            const popOsc = audioContext.createOscillator();
            const popGain = audioContext.createGain();

            popOsc.connect(popGain);
            popGain.connect(audioContext.destination);

            popOsc.type = "square";
            popOsc.frequency.setValueAtTime(300 + Math.random() * 200, audioContext.currentTime);

            popGain.gain.setValueAtTime(0, audioContext.currentTime);
            popGain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
            popGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

            popOsc.start(audioContext.currentTime);
            popOsc.stop(audioContext.currentTime + 0.1);
          }, j * 50);
        }
      }, i * 150);
    }
  } catch (error) {
    console.warn("Could not play firework sound:", error);
  }
}

export default function MatchCelebration({
  profileName,
  photoUrl,
  onClose,
  matchId,
  explanation,
  skipLoadingReveal = false,
}: MatchCelebrationProps) {
  const [revealed, setRevealed] = useState(() => skipLoadingReveal);
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const soundPlayedRef = useRef(false);
  const openedAtRef = useRef(Date.now());
  const navigate = useNavigate();

  // “Finding your curated match” — at least REVEAL_DELAY_MS, aligned with mobile when matchId is present
  useEffect(() => {
    if (skipLoadingReveal) {
      setRevealed(true);
      return;
    }
    const elapsed = Date.now() - openedAtRef.current;
    const remaining = Math.max(0, REVEAL_DELAY_MS - elapsed);
    const t = window.setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(t);
  }, [skipLoadingReveal, matchId]);

  useEffect(() => {
    if (!revealed) return;

    const timer1 = setTimeout(() => setShowContent(true), 100);
    const timer2 = setTimeout(() => setShowConfetti(true), 300);
    const timer3 = setTimeout(() => setShowButton(true), 2000);

    if (!soundPlayedRef.current) {
      const soundTimer = setTimeout(() => {
        playFireworkSound();
        soundPlayedRef.current = true;
      }, 300);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(soundTimer);
      };
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [revealed]);

  const handleSendMessage = () => {
    onClose();
    if (matchId?.trim()) {
      navigate("/matches", { state: { openMatchId: matchId.trim() } });
    } else {
      navigate("/matches");
    }
  };

  const handleKeepBrowsing = () => {
    onClose();
  };

  const confettiColors = ["#667eea", "#764ba2", "#a855f7", "#c026d3", "#ec4899", "#f472b6"];

  return (
    <div className="match-celebration-overlay match-celebration-overlay-native">
      <div className="match-celebration-gradient-bg" aria-hidden />
      <div className="match-celebration-backdrop" />

      {!revealed && (
        <div className="match-celebration-finding-card" role="status" aria-live="polite">
          <div className="match-celebration-finding-heart">💕</div>
          <h2 className="match-celebration-finding-title">Finding your curated match</h2>
          <div className="match-celebration-finding-dots">
            <span className="match-celebration-finding-dot" />
            <span className="match-celebration-finding-dot" />
            <span className="match-celebration-finding-dot" />
          </div>
          <p className="match-celebration-finding-sub">Good things take a moment...</p>
        </div>
      )}

      {revealed && showConfetti && (
        <div className="confetti-container match-celebration-confetti-native">
          {Array.from({ length: 55 }).map((_, i) => (
            <div
              key={i}
              className="confetti-particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: confettiColors[Math.floor(Math.random() * confettiColors.length)],
              }}
            />
          ))}
        </div>
      )}

      {revealed && (
        <div className={`match-celebration-content ${showContent ? "show" : ""}`}>
          <div className="match-celebration-photo-container">
            <div className="match-celebration-photo-ring ring-1" />
            <div className="match-celebration-photo-ring ring-2" />
            <div className="match-celebration-photo-ring ring-3" />
            <div className="match-celebration-photo">
              {photoUrl ? (
                <img
                  src={getPhotoUrl(photoUrl)}
                  alt={profileName}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              ) : (
                <div className="match-celebration-placeholder">{profileName.charAt(0).toUpperCase()}</div>
              )}
            </div>
          </div>

          <div className="match-celebration-text">
            <h1 className="match-celebration-title">
              <span className="match-celebration-word word-1">It&apos;s</span>
              <span className="match-celebration-word word-2">a</span>
              <span className="match-celebration-word word-3">Match! 💖</span>
            </h1>
            <p className="match-celebration-subtitle">
              You and <strong>{profileName}</strong> connected
            </p>
            <p className="match-celebration-message">Start chatting now! 💬</p>

            {explanation && explanation.reasons.length > 0 && (
              <div className="match-celebration-explanation">
                <p className="match-celebration-explanation-title">Why you matched:</p>
                <ul className="match-celebration-explanation-list">
                  {explanation.reasons.map((reason, index) => (
                    <li key={index}>
                      <span aria-hidden>✨</span> {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showButton && (
              <div className="match-celebration-actions">
                <button type="button" className="match-celebration-button match-celebration-button-primary" onClick={handleSendMessage}>
                  Send a Message 💌
                </button>
                <button type="button" className="match-celebration-button match-celebration-button-secondary" onClick={handleKeepBrowsing}>
                  Keep Browsing
                </button>
              </div>
            )}
          </div>

          <div className="match-celebration-sparkles">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="sparkle"
                style={
                  {
                    "--angle": `${(i * 360) / 12}deg`,
                    "--delay": `${i * 0.1}s`,
                  } as React.CSSProperties
                }
              >
                ✨
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
