import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { getPhotoUrl } from "../utils/photoUrl";
import MatchCelebration from "../components/MatchCelebration";
import TokenDisplay from "../components/TokenDisplay";
import ConnectLandingMark from "../components/ConnectLandingMark";
import { io, Socket } from "socket.io-client";

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location?: string;
  bio?: string;
  photoUrl?: string;
  photos?: Photo[];
  interests: string[];
  lookingFor?: string;
  distance?: number | null;
}

type ConnectLandingMode = "loading" | "gate";

function BrowseConnectLandingChrome({
  mode,
  onConnect,
  unlocking,
  gateError,
}: {
  mode: ConnectLandingMode;
  onConnect?: () => void;
  unlocking?: boolean;
  gateError?: string;
}) {
  const isGate = mode === "gate";

  return (
    <div className="browse-page-native native-app-screen connect-landing-page">
      {isGate && (
        <div className="browse-native-token-fixed">
          <TokenDisplay />
        </div>
      )}
      <div className="connect-landing">
        <div className="connect-landing__card">
          <div className="connect-landing__logo-row">
            <ConnectLandingMark />
            <span className="connect-landing__brand">Mulligan</span>
          </div>

          <h1 className="connect-landing__title">Discover People</h1>
          <p className="connect-landing__subtitle">
            Find someone who shares your interests and values
          </p>

          <div className="connect-landing__features">
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">✨</span>
              <span className="connect-landing__feature-text">
                Quality
                <br />
                Matches
              </span>
            </div>
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">🎯</span>
              <span className="connect-landing__feature-text">
                Shared
                <br />
                Interests
              </span>
            </div>
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">💝</span>
              <span className="connect-landing__feature-text">
                Meaningful
                <br />
                Connections
              </span>
            </div>
          </div>

          {isGate ? (
            <>
              {gateError ? (
                <div className="browse-native-error" role="alert" style={{ marginBottom: "1rem" }}>
                  ⚠️ {gateError}
                </div>
              ) : null}
              <button
                type="button"
                className="connect-landing__cta"
                onClick={() => onConnect?.()}
                disabled={unlocking}
                aria-busy={unlocking}
              >
                {unlocking ? (
                  <>
                    <span className="connect-landing__spinner" />
                    <span>Connecting…</span>
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </>
          ) : (
            <div
              className="connect-landing__cta connect-landing__cta--loading"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="connect-landing__spinner" />
              <span>Finding people…</span>
            </div>
          )}

          <p className="connect-landing__hint">⛳ Use a Mulligan</p>
        </div>
      </div>
    </div>
  );
}

function BrowseLocation({ location }: { location?: string }) {
  if (!location) return null;
  const parts = location.split(",").map((s) => s.trim());
  const city = parts[0] || "";
  const stateRest = parts.slice(1).join(", ") || "";
  if (!stateRest) {
    return <div className="browse-native-location">📍 {location}</div>;
  }
  return (
    <div className="browse-native-location">
      <span aria-hidden>📍 </span>
      <span>{city}</span>
      <span>, </span>
      <span>{stateRest}</span>
    </div>
  );
}

export default function Browse() {
  const { profile: userProfile, loading: authLoading } = useAuth();
  /** Mirrors mobile Connect tab: no /users/browse until user taps Connect (unlock-browse) this session. */
  const [browseSessionActive, setBrowseSessionActive] = useState(false);
  const [unlockingBrowse, setUnlockingBrowse] = useState(false);
  const [gateError, setGateError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true); // Used in fetchProfile
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [hasFetched, setHasFetched] = useState(false); // Track if we've fetched at least once
  const [matchNotification, setMatchNotification] = useState<{ message: string; type: "success" | "info" | "warning" | "error" } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();
  const photoRailRef = useRef<HTMLDivElement>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const displayPhotos = useMemo(() => {
    if (!currentProfile) return [] as { id: string; url: string }[];
    const raw = currentProfile.photos?.length
      ? [...currentProfile.photos].sort(
          (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
        )
      : [];
    if (raw.length) {
      return raw.map((p) => ({ id: p.id, url: getPhotoUrl(p.url) }));
    }
    if (currentProfile.photoUrl) {
      return [{ id: "legacy", url: getPhotoUrl(currentProfile.photoUrl) }];
    }
    return [];
  }, [currentProfile]);

  useEffect(() => {
    setPhotoIndex(0);
    const el = photoRailRef.current;
    if (el) el.scrollLeft = 0;
  }, [currentProfile?.id]);

  const onPhotoRailScroll = useCallback(() => {
    const el = photoRailRef.current;
    if (!el || displayPhotos.length <= 1) return;
    const w = el.clientWidth || 1;
    const idx = Math.min(
      displayPhotos.length - 1,
      Math.max(0, Math.round(el.scrollLeft / w))
    );
    setPhotoIndex(idx);
  }, [displayPhotos.length]);

  const scrollToPhoto = useCallback((i: number) => {
    const el = photoRailRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: i * w, behavior: "smooth" });
  }, []);

  // Define fetchProfile first with useCallback before using it in useEffect
  const fetchProfile = useCallback(async () => {
    console.log('🔄 fetchProfile called, offset:', offset);
    try {
      setLoading(true);
      setError(""); // Clear any previous errors
      
      console.log('📡 Making API request to /users/browse?offset=' + offset);
      
      const data = await api.get<{ profile: Profile | null; hasMore: boolean; offset: number; total: number }>(`/users/browse?offset=${offset}`);
      
      console.log('✅ API response received:', { 
        hasProfile: !!data.profile, 
        hasMore: data.hasMore,
        profileName: data.profile?.displayName || 'null'
      });
      
      if (data.profile) {
        // Fetch photos for this profile
        try {
          const photosData = await api.get<{ photos: Photo[] }>(`/photos/profile/${data.profile.id}`);
          data.profile.photos = photosData.photos;
          console.log('✅ Photos fetched:', photosData.photos.length);
        } catch (photoErr) {
          // Photos might not exist yet, that's okay
          console.log('ℹ️ No photos found (this is okay)');
          data.profile.photos = [];
        }
      } else {
        console.log('ℹ️ No profile returned (no more profiles or error)');
      }
      
      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
      console.log('✅ State updated - currentProfile:', data.profile ? 'has profile' : 'null', 'hasMore:', data.hasMore);
      
      // Debug: Log distance info
      if (data.profile) {
        console.log('📍 Profile received:', {
          name: data.profile.displayName,
          location: data.profile.location,
          distance: data.profile.distance,
          distanceType: typeof data.profile.distance,
          distanceIsNull: data.profile.distance === null,
          distanceIsUndefined: data.profile.distance === undefined,
          fullProfile: data.profile
        });
      }
    } catch (err: any) {
      console.error('❌ Browse fetchProfile error:', {
        err,
        message: err?.message,
        error: err?.error,
        status: err?.status,
        response: err?.response,
        responseData: err?.response?.data
      });
      
      // Extract error message from various possible locations
      const errorMessage = 
        err?.response?.data?.error || 
        err?.error || 
        err?.message || 
        String(err) || 
        "Failed to load profiles";
      
      const errorLower = errorMessage.toLowerCase();
      const status = err?.status || err?.response?.status;

      if (
        status === 403 &&
        (errorLower.includes("browsing is locked") ||
          errorLower.includes("use a token to unlock") ||
          errorLower.includes("requiresToken"))
      ) {
        setCurrentProfile(null);
        setBrowseSessionActive(false);
        setError("");
        setGateError("");
        return;
      }
      
      // Check for various profile-related error messages
      if (
        status === 400 ||
        errorLower.includes("complete your profile") || 
        errorLower.includes("please complete your profile") ||
        errorLower.includes("please complete") ||
        (errorLower.includes("profile") && (errorLower.includes("not found") || errorLower.includes("complete")))
      ) {
        // This is a profile missing error - show create profile button
        console.log('ℹ️ Profile missing detected, showing create profile button');
        setCurrentProfile(null);
        setError(""); // Clear any error state
      } else {
        // For other errors, show them but also log for debugging
        console.error('❌ Non-profile error in Browse:', errorMessage);
        setError(errorMessage);
        setCurrentProfile(null); // Ensure we clear the profile on error
      }
    } finally {
      // Always set loading to false and mark as fetched, even if there's an error
      console.log('✅ Setting loading to false and marking as fetched');
      setLoading(false);
      setHasFetched(true); // Mark that we've attempted a fetch (success or failure)
    }
  }, [offset]);

  const handleUnlockBrowse = useCallback(async () => {
    if (unlockingBrowse || !userProfile) return;
    setUnlockingBrowse(true);
    setGateError("");
    setError("");
    try {
      await api.post("/users/unlock-browse", {});
    } catch (err: any) {
      const msg = err?.message || String(err || "Failed to unlock browsing");
      setGateError(msg);
      setUnlockingBrowse(false);
      return;
    }
    setBrowseSessionActive(true);
    setUnlockingBrowse(false);
    await fetchProfile();
  }, [unlockingBrowse, userProfile, fetchProfile]);

  // Refetch when offset changes (for pagination) - only if we've already fetched once
  useEffect(() => {
    if (hasFetched && offset > 0) {
      console.log('🔄 Offset changed to:', offset, '- refetching');
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]); // Only depend on offset, not fetchProfile to avoid loops

  // Initialize socket connection for match notifications
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !userProfile) return;

    // Use API URL from environment variable (for production) or ngrok (for testing), otherwise localhost
    const socketUrl: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || 'http://localhost:3001';
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Browse: Connected to WebSocket server');
    });

    socket.on('disconnect', () => {
      console.log('❌ Browse: Disconnected from WebSocket server');
    });

    // Listen for new match notifications
    socket.on('new_match', (data: { matchId: string; otherUserId: string; otherUserName: string; message: string; stage: string }) => {
      console.log('🎉 Browse: New match notification received:', data);
      
      // Show notification
      setMatchNotification({
        message: data.message,
        type: "success"
      });

      // Auto-dismiss notification after 5 seconds
      setTimeout(() => {
        setMatchNotification(null);
      }, 5000);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userProfile]); // Reconnect if user changes

  const playConnectSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 0.4;
      const sampleRate = audioContext.sampleRate;
      const frameCount = sampleRate * duration;
      const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const progress = t / duration;
        
        // Layer 1: Quick upward sweep (whoosh up)
        const sweep1 = Math.sin(2 * Math.PI * (400 + progress * 800) * t);
        
        // Layer 2: Resonant tone that builds and releases
        const toneFreq = 600 + Math.sin(progress * Math.PI * 2) * 200;
        const tone = Math.sin(2 * Math.PI * toneFreq * t);
        
        // Layer 3: High frequency sparkle
        const sparkle = Math.sin(2 * Math.PI * (2000 - progress * 1000) * t) * 0.5;
        
        // Layer 4: Low frequency thump for impact
        const thump = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-progress * 8);
        
        // Envelope: Quick attack, smooth release
        let envelope;
        if (progress < 0.1) {
          envelope = progress * 10; // Quick attack
        } else {
          envelope = Math.pow(1 - (progress - 0.1) / 0.9, 2); // Smooth release
        }
        
        // Combine all layers with different weights
        const combined = (
          sweep1 * 0.3 +
          tone * 0.4 +
          sparkle * 0.2 +
          thump * 0.1
        ) * envelope;
        
        data[i] = Math.max(-1, Math.min(1, combined)); // Clamp to valid range
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      
      // Add a subtle reverb-like effect with a gain node
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.6; // Volume control
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      source.start(0);
    } catch (err) {
      // Silently fail if audio context is not available
      console.debug('Audio not available');
    }
  };

  const handleConnect = async (profile: Profile, expandSlot?: boolean) => {
    if (connecting) return; // Prevent double-clicks
    
    setConnecting(true);
    setError("");
    
    // Play cool connect sound when connecting
    playConnectSound();
    
    try {
      // Consume token and create match immediately
      const result = await api.post<{ message: string; isMutual: boolean; matchId: string; stage: string }>(
        "/matches/connect",
        { targetUserId: profile.userId, expandSlot: expandSlot || false }
      );

      console.log('✅ Connect successful:', result);

      console.log('✅ Connect successful, showing celebration');

      // Reset connecting state immediately since the API call succeeded
      setConnecting(false);

      // Show match celebration
      setMatchedProfile(profile);
      setShowMatchCelebration(true);
      
      // Move to next profile after celebration (handled by handleCelebrationClose)
    } catch (err) {
      console.error('❌ Connect error:', err);
      
      // Extract error message - ApiError has a status property
      let errorMessage = 'Failed to connect. Please try again.';
      
      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
        
        // Check if it's an ApiError (which has a status property)
        if ('status' in err) {
          const apiErr = err as Error & { status: number; code?: string; canExpand?: boolean; currentLimit?: number; newLimit?: number };
          // Check if at match limit - offer to expand slot with extra token
          if (apiErr.status === 400 && apiErr.code === 'AT_MATCH_LIMIT' && apiErr.canExpand) {
            const currentLimit = apiErr.currentLimit ?? 20;
            const newLimit = apiErr.newLimit ?? 8;
            setConnecting(false);
            const ok = window.confirm(
              `You’ve reached your limit of ${currentLimit} active chats. You need 2 Mulligan tokens (1 to connect + 1 for the extra slot). Spend 2 tokens to connect?`
            );
            if (ok) {
              handleConnect(profile, true);
            }
            return;
          }
          // Provide more specific error messages based on status code
          if (apiErr.status === 400) {
            // Bad request - likely validation error or missing requirements (no token, no photos, etc.)
            errorMessage = err.message || 'Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.';
          } else if (apiErr.status === 401) {
            errorMessage = 'Session expired. Please log in again.';
          } else if (apiErr.status === 404) {
            errorMessage = 'Profile not found. Please refresh and try again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as any).message) || errorMessage;
      }
      
      console.error('❌ Connect error details:', {
        error: err,
        errorMessage,
        profileId: profile?.id,
        userId: profile?.userId,
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        hasStatus: err instanceof Error && 'status' in err ? (err as any).status : 'N/A'
      });
      
      // Show error
      setError(errorMessage);
      
      // Clear error after 8 seconds (longer so user can read it)
      setTimeout(() => setError(""), 8000);
      
      // Reset connecting state
      setConnecting(false);
    }
  };

  const handleCelebrationClose = () => {
    console.log('🎉 Celebration closed, moving to next profile');
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    // Move to next profile after celebration
    setOffset(prev => prev + 1);
  };

  const needsProfile = !userProfile && !authLoading && !loading;
  const showConnectGate =
    !!userProfile && !browseSessionActive && !authLoading && !loading;
  
  // If there's an error but we don't have a profile, treat it as a profile creation issue
  // This is a fallback to ensure users can always create a profile
  if (error && !userProfile && !loading) {
    console.log('Error detected but no profile - showing create profile option:', error);
    // Don't return error, show create profile button instead
  }

  if (authLoading || loading) {
    return <BrowseConnectLandingChrome mode="loading" />;
  }

  if (showConnectGate) {
    return (
      <BrowseConnectLandingChrome
        mode="gate"
        onConnect={handleUnlockBrowse}
        unlocking={unlockingBrowse}
        gateError={gateError}
      />
    );
  }

  return (
    <div className="browse-page-native native-app-screen">
      {matchNotification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor:
              matchNotification.type === "success" ? "#10b981" : "#ef4444",
            color: "white",
            padding: "16px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
            maxWidth: "90%",
            textAlign: "center",
            cursor: "pointer",
          }}
          onClick={() => {
            setMatchNotification(null);
            navigate("/matches");
          }}
        >
          {matchNotification.message}
        </div>
      )}

      {needsProfile ? (
        <div className="browse-native-needs-profile">
          <div className="browse-native-needs-profile-emoji">📝</div>
          {error && (
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "1rem",
                fontSize: "0.95rem",
              }}
            >
              {error}
            </p>
          )}
          <p>Complete your profile to start discovering people.</p>
          <button
            type="button"
            onClick={() => navigate("/create-profile")}
            className="btn btn-primary"
            style={{ marginTop: "1.25rem" }}
          >
            Create Profile 🚀
          </button>
        </div>
      ) : browseSessionActive && hasFetched && !currentProfile && !loading ? (
        <div className="browse-native-caught-up">
          <div className="browse-native-caught-up-card">
            <div className="browse-native-caught-up-ring">🔍</div>
            <h2>You're all caught up</h2>
            <p>
              You&apos;ve seen everyone for now. Check back later for new people.
            </p>
          </div>
        </div>
      ) : currentProfile ? (
        <>
          <div className="browse-native-token-fixed">
            <TokenDisplay />
          </div>
          <div className="browse-native-scroll">
            <header className="browse-native-header">
              <h1>Discover People</h1>
              <p>Find someone who shares your interests and values</p>
            </header>
            {error && (
              <div className="browse-native-error" role="alert">
                ⚠️ {error}
              </div>
            )}
            <div className="browse-native-card-shell">
              <article className="browse-native-card">
                <div
                  ref={photoRailRef}
                  className="browse-native-photo-rail"
                  onScroll={onPhotoRailScroll}
                >
                  {displayPhotos.length === 0 ? (
                    <div className="browse-native-photo-slide">
                      <div className="browse-native-photo-placeholder">
                        {(currentProfile.displayName || "?").charAt(0).toUpperCase()}
                      </div>
                    </div>
                  ) : (
                    displayPhotos.map((ph, i) => (
                      <div
                        key={ph.id}
                        className="browse-native-photo-slide"
                      >
                        <img
                          src={ph.url}
                          alt={`${currentProfile.displayName} — photo ${i + 1}`}
                          loading="lazy"
                        />
                      </div>
                    ))
                  )}
                </div>
                {displayPhotos.length > 1 && (
                  <div className="browse-native-dots" role="tablist" aria-label="Photos">
                    {displayPhotos.map((ph, i) => (
                      <button
                        key={ph.id}
                        type="button"
                        role="tab"
                        aria-selected={i === photoIndex}
                        className={
                          i === photoIndex
                            ? "browse-native-dot browse-native-dot--active"
                            : "browse-native-dot"
                        }
                        onClick={() => scrollToPhoto(i)}
                      />
                    ))}
                  </div>
                )}
                <div className="browse-native-info">
                  <div className="browse-native-name-row">
                    <span className="browse-native-name">
                      {currentProfile.displayName}
                    </span>
                    <span className="browse-native-age">{currentProfile.age}</span>
                  </div>
                  <BrowseLocation location={currentProfile.location} />
                  {typeof currentProfile.distance === "number" && (
                    <div className="browse-native-distance">
                      {Math.round(currentProfile.distance)} mi away
                    </div>
                  )}
                  {currentProfile.bio ? (
                    <p className="browse-native-bio">{currentProfile.bio}</p>
                  ) : null}
                  {currentProfile.lookingFor ? (
                    <div className="browse-native-looking">
                      <span className="browse-native-looking-label">
                        Looking for:
                      </span>
                      <span className="browse-native-looking-value">
                        {currentProfile.lookingFor}
                      </span>
                    </div>
                  ) : null}
                  {currentProfile.interests?.length ? (
                    <>
                      <div className="browse-native-interests-label">
                        Interests
                      </div>
                      <div className="browse-native-interests">
                        {currentProfile.interests.map((tag) => (
                          <span
                            key={tag}
                            className="browse-native-interest-tag"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </article>
            </div>
          </div>
          <div className="browse-native-connect-bar">
            <button
              type="button"
              className="browse-native-connect-btn"
              onClick={() => !connecting && handleConnect(currentProfile)}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Connect & Match 🎟️"}
            </button>
          </div>
        </>
      ) : null}

      {showMatchCelebration && matchedProfile && (() => {
        const primaryPhoto = matchedProfile.photos?.find(p => p.isPrimary) || matchedProfile.photos?.[0];
        const photoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : (matchedProfile.photoUrl ? getPhotoUrl(matchedProfile.photoUrl) : undefined);
        return (
          <MatchCelebration
            profileName={matchedProfile.displayName}
            photoUrl={photoUrl}
            onClose={handleCelebrationClose}
          />
        );
      })()}
    </div>
  );
}
