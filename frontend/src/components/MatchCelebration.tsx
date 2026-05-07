import { useEffect, useState, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getPhotoUrl } from "../utils/photoUrl";
import { formatPreferredMatchesFromGenders } from "../utils/preferredMatchesLabel";

const REVEAL_DELAY_MS = 7000;

interface MatchExplanation {
  reasons: string[];
}

/** Rich partner info shown below the headline (browse after match + profile modal celebration). */
export interface CelebrationPartnerProfile {
  age?: number;
  gender?: string;
  location?: string | null;
  bio?: string | null;
  lookingFor?: string | null;
  interests?: string[];
  values?: string[];
  partnerQualities?: Array<{ quality: string; importance: number }>;
  dealbreakers?: string[];
  /** Raw preferred_genders preference (Man / Woman / Everyone). */
  preferredGenders?: string[] | null;
}

interface MatchCelebrationProps {
  profileName: string;
  /** Primary / first photo URL key or absolute URL — used if `photoGalleryUrls` omitted. */
  photoUrl?: string;
  /** All photos for the lightbox carousel (recommended). Paths are normalized with getPhotoUrl. */
  photoGalleryUrls?: string[];
  /** Interests, dealbreakers, values, prefs, bio, etc. */
  partnerProfileDetail?: CelebrationPartnerProfile | null;
  /** Legacy / ProfileModal: used when `onKeepBrowsing` / `onOpenChat` are not set. */
  onClose?: () => void;
  /** Browse: return user to Connect landing without advancing browse offset. */
  onKeepBrowsing?: () => void;
  /** Browse: dismiss overlay and open Matches (parent handles navigation). */
  onOpenChat?: () => void;
  matchId?: string | null;
  explanation?: MatchExplanation | null;
  /** Recipient flows can skip the “finding match” beat. */
  skipLoadingReveal?: boolean;
  /**
   * Initiator (Connect tab): wait at least REVEAL_DELAY_MS from overlay open, then reveal once matchId is set (mirrors mobile).
   */
  revealWhenMatchIdReady?: boolean;
}

function hasPartnerProfilePanel(d: CelebrationPartnerProfile | null | undefined): boolean {
  if (!d) return false;
  const hasSubs = !!(
    d.bio ||
    d.lookingFor ||
    (d.interests && d.interests.length) ||
    (d.values && d.values.length) ||
    (d.partnerQualities && d.partnerQualities.length) ||
    (d.dealbreakers && d.dealbreakers.length)
  );
  const prefsKnown = d.preferredGenders !== undefined;
  return hasSubs || prefsKnown;
}

function MatchCelebrationPartnerSections({
  detail,
}: {
  detail: CelebrationPartnerProfile;
}) {
  const pronoun =
    detail.gender === "Man" ? "him" : detail.gender === "Woman" ? "her" : "them";

  return (
    <div className="match-celebration-profile-panel">
      <h4 style={{ marginBottom: "var(--space-3)", color: "rgba(255,255,255,0.92)" }}>About {pronoun}</h4>
      {detail.lookingFor ? (
        <div className="stage2-profile-block">
          <h4>Looking for</h4>
          <p className="stage2-profile-text">{detail.lookingFor}</p>
        </div>
      ) : null}
      {detail.preferredGenders !== undefined ? (
        <div className="stage2-profile-block">
          <h4>Wants to connect with</h4>
          <p className="stage2-profile-text">{formatPreferredMatchesFromGenders(detail.preferredGenders)}</p>
        </div>
      ) : null}
      {detail.bio ? (
        <div className="stage2-profile-block">
          <h4>Bio</h4>
          <p className="stage1-bio stage2-profile-text">{detail.bio}</p>
        </div>
      ) : null}
      {(detail.partnerQualities?.length ?? 0) > 0 ? (
        <div className="stage2-profile-block">
          <h4>What they&apos;re looking for</h4>
          <div className="qualities-list">
            {detail.partnerQualities!.map((q, idx) => (
              <div key={idx} className="quality-item">
                <span className="quality-name">{q.quality}</span>
                <span className="quality-importance">{"⭐".repeat(q.importance)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {(detail.interests?.length ?? 0) > 0 ? (
        <div className="stage2-profile-block">
          <h4>Interests</h4>
          <div className="profile-card-interests">
            {detail.interests!.map((interest) => (
              <span key={interest} className="interest-tag">
                {interest}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {(detail.values?.length ?? 0) > 0 ? (
        <div className="stage2-profile-block">
          <h4>Values</h4>
          <div className="profile-card-interests">
            {detail.values!.map((value) => (
              <span key={value} className="value-tag">
                {value}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {(detail.dealbreakers?.length ?? 0) > 0 ? (
        <div className="stage2-profile-block">
          <h4>Dealbreakers</h4>
          <ul className="stage2-dealbreakers-list">
            {detail.dealbreakers!.map((desc, i) => (
              <li key={i}>{desc}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
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

type PhotoLightboxState = { urls: string[]; index: number };

export default function MatchCelebration({
  profileName,
  photoUrl,
  photoGalleryUrls,
  partnerProfileDetail = null,
  onClose,
  onKeepBrowsing,
  onOpenChat,
  matchId,
  explanation,
  skipLoadingReveal = false,
  revealWhenMatchIdReady = false,
}: MatchCelebrationProps) {
  const [revealed, setRevealed] = useState(() => skipLoadingReveal);
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const soundPlayedRef = useRef(false);
  const openedAtRef = useRef(Date.now());
  const navigate = useNavigate();
  const [photoLightbox, setPhotoLightbox] = useState<PhotoLightboxState | null>(null);
  const lightboxTouchX = useRef<number | null>(null);

  const resolvedGalleryUrls = useMemo(() => {
    const fromProp = photoGalleryUrls?.length
      ? photoGalleryUrls.map((u) => getPhotoUrl(u))
      : photoUrl
        ? [getPhotoUrl(photoUrl)]
        : [];
    const seen = new Set<string>();
    return fromProp.filter((u) => {
      if (!u?.trim() || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }, [photoGalleryUrls, photoUrl]);

  const canOpenPhotoLightbox = resolvedGalleryUrls.length > 0;

  const closeLightbox = useCallback(() => setPhotoLightbox(null), []);

  const stepLightbox = useCallback((delta: number) => {
    setPhotoLightbox((prev) => {
      if (!prev || prev.urls.length < 2) return prev;
      const n = prev.urls.length;
      const idx = (prev.index + delta + n * 10) % n;
      return { ...prev, index: idx };
    });
  }, []);

  useEffect(() => {
    openedAtRef.current = Date.now();
    soundPlayedRef.current = false;
  }, []);

  useEffect(() => {
    if (skipLoadingReveal) {
      setRevealed(true);
      return;
    }
    if (revealWhenMatchIdReady) {
      if (!matchId?.trim()) return;
      const elapsed = Date.now() - openedAtRef.current;
      const remaining = Math.max(0, REVEAL_DELAY_MS - elapsed);
      const t = window.setTimeout(() => setRevealed(true), remaining);
      return () => clearTimeout(t);
    }
    const t = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [skipLoadingReveal, revealWhenMatchIdReady, matchId]);

  useEffect(() => {
    if (!revealed) return;

    const timer1 = setTimeout(() => setShowContent(true), 100);
    const timer2 = setTimeout(() => setShowConfetti(true), 300);
    const timer3 = setTimeout(() => setShowButton(true), 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [revealed]);

  useEffect(() => {
    if (!showContent) return;
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    const t = window.setTimeout(() => {
      playFireworkSound();
    }, 180);
    return () => clearTimeout(t);
  }, [showContent]);

  useEffect(() => {
    if (!photoLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoLightbox, closeLightbox, stepLightbox]);

  const handleSendMessage = () => {
    if (onOpenChat) {
      onOpenChat();
      return;
    }
    onClose?.();
    if (matchId?.trim()) {
      navigate("/matches", { state: { openMatchId: matchId.trim() } });
    } else {
      navigate("/matches");
    }
  };

  const handleKeepBrowsing = () => {
    if (onKeepBrowsing) {
      onKeepBrowsing();
      return;
    }
    onClose?.();
  };

  const confettiColors = ["#667eea", "#764ba2", "#a855f7", "#c026d3", "#ec4899", "#f472b6"];

  const showPartnerMeta =
    !!(partnerProfileDetail && (partnerProfileDetail.age ?? partnerProfileDetail.gender ?? partnerProfileDetail.location));

  const showProfilePanel = hasPartnerProfilePanel(partnerProfileDetail);

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
            <button
              type="button"
              className="match-celebration-photo-btn"
              aria-label={canOpenPhotoLightbox ? "View larger photo" : undefined}
              disabled={!canOpenPhotoLightbox}
              onClick={() => {
                if (!resolvedGalleryUrls.length) return;
                setPhotoLightbox({ urls: resolvedGalleryUrls, index: 0 });
              }}
            >
              <div className="match-celebration-photo">
                {resolvedGalleryUrls.length > 0 ? (
                  <img
                    src={resolvedGalleryUrls[0]}
                    alt=""
                    draggable={false}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="match-celebration-placeholder">{profileName.charAt(0).toUpperCase()}</div>
                )}
              </div>
            </button>
          </div>

          {showPartnerMeta ? (
            <p className="match-celebration-partner-meta">
              {[partnerProfileDetail!.age != null ? `${partnerProfileDetail!.age}` : null, partnerProfileDetail!.gender].filter(Boolean).join(" · ")}
              {partnerProfileDetail!.location ? (
                <>
                  <br />
                  <span aria-hidden>📍 </span>
                  <strong>{partnerProfileDetail!.location}</strong>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="match-celebration-text">
            <h1 className="match-celebration-title">
              <span className="match-celebration-word word-1">It&apos;s</span>
              <span className="match-celebration-word word-2">a</span>
              <span className="match-celebration-word word-3">Match! 💖</span>
            </h1>
            <p className="match-celebration-subtitle">You&apos;re connected!</p>
            <p className="match-celebration-message">
              Start messaging <strong>{profileName}</strong> 💬
            </p>

            {showProfilePanel && partnerProfileDetail ? (
              <MatchCelebrationPartnerSections detail={partnerProfileDetail} />
            ) : null}

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
                  } as CSSProperties
                }
              >
                ✨
              </div>
            ))}
          </div>
        </div>
      )}

      {photoLightbox && photoLightbox.urls.length > 0 && (
        <div
          className="match-photo-lightbox match-photo-lightbox--celebration"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${photoLightbox.index + 1} of ${photoLightbox.urls.length}`}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="match-photo-lightbox-close"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            ×
          </button>
          {photoLightbox.urls.length > 1 && (
            <button
              type="button"
              className="match-photo-lightbox-nav match-photo-lightbox-nav--prev"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(-1);
              }}
            >
              ‹
            </button>
          )}
          {photoLightbox.urls.length > 1 && (
            <button
              type="button"
              className="match-photo-lightbox-nav match-photo-lightbox-nav--next"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(1);
              }}
            >
              ›
            </button>
          )}
          <div
            className="match-photo-lightbox-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              lightboxTouchX.current = e.changedTouches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const start = lightboxTouchX.current;
              lightboxTouchX.current = null;
              if (start == null) return;
              const dx = e.changedTouches[0].clientX - start;
              if (dx > 56) stepLightbox(-1);
              else if (dx < -56) stepLightbox(1);
            }}
          >
            <img src={photoLightbox.urls[photoLightbox.index]} alt={profileName} className="match-photo-lightbox-img" />
            {photoLightbox.urls.length > 1 && (
              <div className="match-photo-lightbox-counter">
                {photoLightbox.index + 1} / {photoLightbox.urls.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
