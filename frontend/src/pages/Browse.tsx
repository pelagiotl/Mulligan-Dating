import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Navigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { MIN_PHOTOS_TO_CONNECT } from "../utils/connectProfileEligibility";
import { getPhotoUrl } from "../utils/photoUrl";
import MatchCelebration, { type CelebrationPartnerProfile } from "../components/MatchCelebration";
import TokenDisplay from "../components/TokenDisplay";
import ConnectButtonEffects from "../components/ConnectButtonEffects";
import ConnectLandingMark from "../components/ConnectLandingMark";
import LaunchCountdown from "../components/LaunchCountdown";
import { io, Socket } from "socket.io-client";
import { getSocketUrl } from "../utils/socketUrl";
import { emitTokenBalanceUpdated } from "../lib/tokenBalanceEvents";
import ConnectLandingTagline from "../components/ConnectLandingTagline";
import { unlockMatchAudio } from "../utils/matchSound";
import WebPushOnboardingPrompt from "../components/WebPushOnboardingPrompt";
import { shouldShowWebPushPromptAfterProfile } from "../constants/webPushPrompt";
import ConnectPhotosRequiredModalWeb from "../components/ConnectPhotosRequiredModalWeb";
import MatchmakingPausedModalWeb from "../components/MatchmakingPausedModalWeb";
import ConnectProfileEnhancementCard from "../components/ConnectProfileEnhancementCard";
import {
  dismissProfileEnhancement,
  isProfileEnhancementDismissed,
  profileEnhancementIncomplete,
  type ProfileEnhancementItem,
  type ProfileEnhancementSnapshot,
} from "../utils/profileEnhancementChecklist";

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

/** Subset of GET /matches list `otherUser` used to hydrate the match celebration drawer. */
interface MatchCelebrationHydration {
  age: number;
  gender: string;
  bio: string | null;
  location: string | null;
  lookingFor?: string | null;
  interests: string[];
  values: string[];
  partnerQualities: Array<{ quality: string; importance: number }>;
  dealbreakers?: string[];
  preferredGenders?: string[] | null;
  photoUrl?: string | null;
  photos?: Photo[];
}

type ConnectLandingMode = "loading" | "gate" | "auto-connecting";

function BrowseConnectLandingChrome({
  mode,
  onConnect,
  unlocking,
  gateError,
  enhancementSlot,
}: {
  mode: ConnectLandingMode;
  onConnect?: () => void;
  unlocking?: boolean;
  gateError?: string;
  enhancementSlot?: ReactNode;
}) {
  const navigate = useNavigate();
  const isGate = mode === "gate";
  const showTokenStrip = isGate || mode === "auto-connecting";

  return (
    <div className="browse-page-native native-app-screen connect-landing-page">
      <LaunchCountdown />
      <div className="connect-landing">
        {showTokenStrip ? (
          <aside className="browse-connect-landing-token" aria-label="Mulligan tokens">
            <TokenDisplay />
          </aside>
        ) : null}

        <button
          type="button"
          className="connect-landing__shell-hint"
          onClick={() => navigate("/settings")}
          aria-label="Open Settings to change Connect tab colors and layout"
        >
          <span aria-hidden>🎨</span>
          <span>Colors in Settings</span>
        </button>

        <div className="connect-landing__card">
          <div className="connect-landing__logo-row">
            <ConnectLandingMark />
            <span className="connect-landing__brand">Mulligan</span>
          </div>

          <h1 className="connect-landing__title">Discover People</h1>
          <ConnectLandingTagline />

          <div className="connect-landing__features">
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">✨</span>
              <span className="connect-landing__feature-text">
                <span className="connect-landing__feature-line">Quality</span>
                <span className="connect-landing__feature-line">Matches</span>
              </span>
            </div>
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">🎯</span>
              <span className="connect-landing__feature-text">
                <span className="connect-landing__feature-line">Shared</span>
                <span className="connect-landing__feature-line">Interests</span>
              </span>
            </div>
            <div className="connect-landing__feature">
              <span className="connect-landing__feature-emoji">💝</span>
              <span className="connect-landing__feature-text">
                <span className="connect-landing__feature-line">Meaningful</span>
                <span className="connect-landing__feature-line">Connections</span>
              </span>
            </div>
          </div>

          {mode === "auto-connecting" ? (
            <div
              className="connect-landing__cta connect-landing__cta--loading"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="connect-landing__spinner" />
              <span>Finding your curated match…</span>
            </div>
          ) : isGate ? (
            <>
              {gateError ? (
                <div className="browse-native-error" role="alert" style={{ marginBottom: "1rem" }}>
                  ⚠️ {gateError}
                </div>
              ) : null}
              <button
                type="button"
                className="connect-landing__cta connect-landing__cta--effects"
                onClick={() => onConnect?.()}
                disabled={unlocking}
                aria-busy={unlocking}
              >
                <ConnectButtonEffects active={!unlocking} borderRadius={18}>
                  {unlocking ? (
                    <>
                      <span className="connect-landing__spinner" />
                      <span>Connecting…</span>
                    </>
                  ) : (
                    "Connect"
                  )}
                </ConnectButtonEffects>
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

          {enhancementSlot}
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
  const { profile: userProfile, loading: authLoading, user, photoCount, refreshProfile } = useAuth();
  /** Mirrors mobile Connect tab: no /users/browse until user taps Connect (unlock-browse) this session. */
  const [browseSessionActive, setBrowseSessionActive] = useState(false);
  const [unlockingBrowse, setUnlockingBrowse] = useState(false);
  /** True while unlock-browse + first auto /matches/connect runs (mirrors mobile isAutoMatching). */
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [gateError, setGateError] = useState("");
  const [showConnectPhotosModal, setShowConnectPhotosModal] = useState(false);
  const [connectPhotosModalCount, setConnectPhotosModalCount] = useState(0);
  const [showMatchmakingPausedModal, setShowMatchmakingPausedModal] = useState(false);
  const [enhancementDismissed, setEnhancementDismissed] = useState(() =>
    isProfileEnhancementDismissed()
  );
  const [enhancementSnapshot, setEnhancementSnapshot] = useState<ProfileEnhancementSnapshot | null>(
    null
  );
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true); // Used in fetchProfile
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [celebrationMatchId, setCelebrationMatchId] = useState<string | null>(null);
  const [celebrationFetchedOther, setCelebrationFetchedOther] = useState<MatchCelebrationHydration | null>(
    null
  );
  const [hasFetched, setHasFetched] = useState(false); // Track if we've fetched at least once
  const [matchNotification, setMatchNotification] = useState<{ message: string; type: "success" | "info" | "warning" | "error" } | null>(null);
  const [showWebPushPrompt, setShowWebPushPrompt] = useState(() => shouldShowWebPushPromptAfterProfile());
  const matchNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMatchCelebrationRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();
  const photoRailRef = useRef<HTMLDivElement>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const handleConnectRef = useRef<(profile: Profile, expandSlot?: boolean) => Promise<void>>(
    async () => {}
  );
  const browseSessionActiveRef = useRef(false);
  useEffect(() => {
    browseSessionActiveRef.current = browseSessionActive;
  }, [browseSessionActive]);

  useEffect(() => {
    showMatchCelebrationRef.current = showMatchCelebration;
  }, [showMatchCelebration]);

  const clearMatchNotification = useCallback(() => {
    if (matchNotificationTimeoutRef.current) {
      clearTimeout(matchNotificationTimeoutRef.current);
      matchNotificationTimeoutRef.current = null;
    }
    setMatchNotification(null);
  }, []);

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
    const socketUrl = getSocketUrl();
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

    // Listen for new match notifications (skip while celebration overlay is open — same match)
    socket.on('new_match', (data: { matchId: string; otherUserId: string; otherUserName: string; message: string; stage: string }) => {
      console.log('🎉 Browse: New match notification received:', data);

      if (showMatchCelebrationRef.current) {
        return;
      }

      if (matchNotificationTimeoutRef.current) {
        clearTimeout(matchNotificationTimeoutRef.current);
      }
      setMatchNotification({
        message: data.message,
        type: "success"
      });
      matchNotificationTimeoutRef.current = setTimeout(() => {
        setMatchNotification(null);
        matchNotificationTimeoutRef.current = null;
      }, 5000);
    });

    // Cleanup on unmount
    return () => {
      if (matchNotificationTimeoutRef.current) {
        clearTimeout(matchNotificationTimeoutRef.current);
        matchNotificationTimeoutRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userProfile]); // Reconnect if user changes

  useEffect(() => {
    if (!celebrationMatchId?.trim() || !showMatchCelebration) {
      setCelebrationFetchedOther(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{
          matches: Array<{ id: string; otherUser: MatchCelebrationHydration }>;
        }>("/matches");
        if (cancelled) return;
        const hit = data.matches.find((m) => m.id === celebrationMatchId.trim());
        setCelebrationFetchedOther(hit?.otherUser ?? null);
      } catch {
        if (!cancelled) setCelebrationFetchedOther(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [celebrationMatchId, showMatchCelebration]);

  const celebrationPhotoGalleryUrls = useMemo(() => {
    if (!matchedProfile) return [] as string[];
    const fromBrowse = matchedProfile.photos?.length
      ? [...matchedProfile.photos]
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
          .map((p) => p.url)
      : [];
    const fromMatch =
      celebrationFetchedOther?.photos?.length
        ? [...celebrationFetchedOther.photos]
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
            .map((p) => p.url)
        : [];
    if (fromBrowse.length) return fromBrowse;
    if (fromMatch.length) return fromMatch;
    if (matchedProfile.photoUrl?.trim()) return [matchedProfile.photoUrl];
    if (celebrationFetchedOther?.photoUrl?.trim()) return [celebrationFetchedOther.photoUrl];
    return [];
  }, [matchedProfile, celebrationFetchedOther]);

  const celebrationPartnerDetail = useMemo((): CelebrationPartnerProfile | null => {
    if (!matchedProfile) return null;
    const ou = celebrationFetchedOther;
    return {
      age: ou?.age ?? matchedProfile.age,
      gender: ou?.gender ?? matchedProfile.gender,
      location: (ou?.location ?? matchedProfile.location) ?? null,
      bio: (ou?.bio ?? matchedProfile.bio) ?? null,
      lookingFor: (ou?.lookingFor ?? matchedProfile.lookingFor) ?? null,
      interests: ou?.interests?.length ? ou.interests : (matchedProfile.interests ?? []),
      values: ou?.values ?? [],
      partnerQualities: ou?.partnerQualities ?? [],
      dealbreakers: ou?.dealbreakers ?? [],
      preferredGenders: ou ? (ou.preferredGenders ?? null) : undefined,
    };
  }, [matchedProfile, celebrationFetchedOther]);

  const handleConnect = useCallback(
    async (profile: Profile, expandSlot?: boolean) => {
      if (connecting) return;

      unlockMatchAudio();

      const hadBrowseSession = browseSessionActiveRef.current;

      setConnecting(true);
      setError("");
      clearMatchNotification();
      setMatchedProfile(profile);
      setCelebrationMatchId(null);
      setShowMatchCelebration(true);

      type ConnectResult = {
        message?: string;
        isMutual?: boolean;
        matchId?: string;
        stage?: string;
        existingMatch?: boolean;
      };

      try {
        const result = await api.post<ConnectResult>("/matches/connect", {
          targetUserId: profile.userId,
          expandSlot: expandSlot || false,
        });

        setConnecting(false);

        if (!result?.matchId) {
          setShowMatchCelebration(false);
          setMatchedProfile(null);
          setCelebrationMatchId(null);
          setError("Connection did not complete. Please try again.");
          setTimeout(() => setError(""), 8000);
          if (!hadBrowseSession) setBrowseSessionActive(false);
          return;
        }

        if (result.existingMatch) {
          setShowMatchCelebration(false);
          setMatchedProfile(null);
          setCelebrationMatchId(null);
          navigate("/matches", { state: { openMatchId: result.matchId } });
          return;
        }

        setCelebrationMatchId(result.matchId);
        setBrowseSessionActive(true);

        try {
          const td = await api.get<{ availableTokens: number }>("/tokens");
          emitTokenBalanceUpdated(td.availableTokens);
        } catch {
          /* non-fatal — navbar refreshes on next navigation */
        }

        const hasPhoto =
          !!profile.photoUrl || !!(profile.photos && profile.photos.length > 0);
        if (!hasPhoto && profile.id) {
          api
            .get<{ photos: Photo[] }>(`/photos/profile/${profile.id}`)
            .then((photosData) => {
              if (photosData?.photos?.length) {
                const primary =
                  photosData.photos.find((p) => p.isPrimary) || photosData.photos[0];
                setMatchedProfile((prev) =>
                  prev
                    ? {
                        ...prev,
                        photos: photosData.photos,
                        photoUrl: primary?.url ?? prev.photoUrl,
                      }
                    : null
                );
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("❌ Connect error:", err);

        setShowMatchCelebration(false);
        setMatchedProfile(null);
        setCelebrationMatchId(null);
        setConnecting(false);
        if (!hadBrowseSession) setBrowseSessionActive(false);

        let errorMessage = "Failed to connect. Please try again.";

        if (err instanceof Error) {
          errorMessage = err.message || errorMessage;

          if ("status" in err) {
            const apiErr = err as Error & {
              status: number;
              code?: string;
              canExpand?: boolean;
              currentLimit?: number;
              newLimit?: number;
            };
            if (apiErr.status === 400 && apiErr.code === "AT_MATCH_LIMIT" && apiErr.canExpand) {
              const currentLimit = apiErr.currentLimit ?? 20;
              const ok = window.confirm(
                `You’ve reached your limit of ${currentLimit} active chats. You need 2 Mulligan tokens (1 to connect + 1 for the extra slot). Spend 2 tokens to connect?`
              );
              if (ok) {
                void handleConnectRef.current(profile, true);
              }
              return;
            }
            if (apiErr.status === 400) {
              errorMessage =
                err.message ||
                "Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.";
            } else if (apiErr.status === 401) {
              errorMessage = "Session expired. Please log in again.";
            } else if (apiErr.status === 404) {
              errorMessage = "Profile not found. Please refresh and try again.";
            } else if (apiErr.status === 408) {
              errorMessage = "Request timed out. The server may be slow. Please try again.";
            }
          }
        } else if (err && typeof err === "object" && "message" in err) {
          errorMessage = String((err as { message: unknown }).message) || errorMessage;
        }

        setError(errorMessage);
        setTimeout(() => setError(""), 8000);
      }
    },
    [connecting, navigate, clearMatchNotification]
  );

  handleConnectRef.current = handleConnect;

  const resolveReadyPhotoCount = useCallback(async (): Promise<number> => {
    if (photoCount >= MIN_PHOTOS_TO_CONNECT) return photoCount;
    try {
      const pm = await api.get<{ photos?: unknown[] }>(`/photos/me?_=${Date.now()}`);
      return Array.isArray(pm.photos) ? pm.photos.length : photoCount;
    } catch {
      return photoCount;
    }
  }, [photoCount]);

  const handleUnlockBrowse = useCallback(async () => {
    if (unlockingBrowse || !userProfile || isAutoMatching) return;

    const readyPhotoCount = await resolveReadyPhotoCount();
    if (readyPhotoCount < MIN_PHOTOS_TO_CONNECT) {
      setConnectPhotosModalCount(readyPhotoCount);
      setShowConnectPhotosModal(true);
      setGateError("");
      return;
    }

    if (user?.matchmakingEnabled === false) {
      setShowMatchmakingPausedModal(true);
      setGateError("");
      return;
    }

    setUnlockingBrowse(true);
    setIsAutoMatching(true);
    setGateError("");
    setError("");

    const runBrowseAndConnect = async () => {
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`);

      if (!data.profile) {
        setCurrentProfile(null);
        setHasMore(data.hasMore);
        setHasFetched(true);
        setBrowseSessionActive(false);
        setGateError(
          "No one new to match with right now. Try widening distance or check back later."
        );
        return;
      }

      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
      setHasFetched(true);
      await handleConnectRef.current(data.profile);
    };

    try {
      try {
        await api.post("/users/unlock-browse", {});
      } catch (unlockErr: unknown) {
        const unlockMsg = String(
          (unlockErr as { message?: string })?.message || ""
        ).toLowerCase();
        if (
          !unlockMsg.includes("already unlocked") &&
          !unlockMsg.includes("browsing is already unlocked")
        ) {
          throw unlockErr;
        }
      }
      await runBrowseAndConnect();
    } catch (err: unknown) {
      const apiErr = err as {
        message?: string;
        code?: string;
        missing?: string[];
        status?: number;
      };
      const msg = apiErr.message || String(err || "Failed to unlock browsing");
      const code = apiErr.code;
      const missing = apiErr.missing ?? [];

      if (
        code === "CONNECT_SETUP_INCOMPLETE" &&
        (missing.includes("photos") || msg.toLowerCase().includes("photo"))
      ) {
        const count = await resolveReadyPhotoCount();
        setConnectPhotosModalCount(count);
        setShowConnectPhotosModal(true);
        setGateError("");
      } else if (code === "MATCHMAKING_DISABLED") {
        setShowMatchmakingPausedModal(true);
        setGateError("");
      } else {
        setGateError(msg);
      }
      setBrowseSessionActive(false);
      setCurrentProfile(null);
    } finally {
      setUnlockingBrowse(false);
      setIsAutoMatching(false);
    }
  }, [
    unlockingBrowse,
    userProfile,
    isAutoMatching,
    user,
    resolveReadyPhotoCount,
  ]);

  /** After “Keep Browsing”: return to Connect landing (user taps Connect again for a new match). */
  const handleCelebrationKeepBrowsing = useCallback(() => {
    clearMatchNotification();
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setCelebrationMatchId(null);
    setBrowseSessionActive(false);
    setCurrentProfile(null);
    setOffset(0);
    setError("");
    setGateError("");
  }, [clearMatchNotification]);

  /** After “Send a Message”: close overlay and open the chat thread. */
  const handleCelebrationOpenChat = useCallback(() => {
    const mid = celebrationMatchId?.trim();
    clearMatchNotification();
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setCelebrationMatchId(null);
    if (mid) {
      navigate("/matches", { state: { openMatchId: mid } });
    } else {
      navigate("/matches");
    }
  }, [celebrationMatchId, navigate, clearMatchNotification]);

  const showConnectGate =
    !!userProfile &&
    !browseSessionActive &&
    !authLoading &&
    !loading &&
    !isAutoMatching;

  useEffect(() => {
    if (!showConnectGate) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{
          profile: { looking_for: string | null };
          interests: unknown[];
          dealbreakers: unknown[];
          lifestyle: ProfileEnhancementSnapshot["lifestyle"];
        }>("/profile");
        if (cancelled) return;
        setEnhancementSnapshot({
          photoCount: photoCount ?? 0,
          interestsCount: data.interests?.length ?? 0,
          lookingFor: data.profile?.looking_for,
          lifestyle: data.lifestyle ?? null,
          dealbreakersCount: data.dealbreakers?.length ?? 0,
        });
      } catch {
        if (!cancelled) setEnhancementSnapshot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showConnectGate, photoCount]);

  const enhancementIncompleteItems = useMemo(() => {
    if (!enhancementSnapshot) return [];
    return profileEnhancementIncomplete(enhancementSnapshot);
  }, [enhancementSnapshot]);

  const enhancementSlot =
    showConnectGate && !enhancementDismissed && enhancementIncompleteItems.length > 0 ? (
      <ConnectProfileEnhancementCard
        items={enhancementIncompleteItems}
        onItemClick={(item: ProfileEnhancementItem) => {
          navigate(`/profile#${item.profileHash}`);
        }}
        onOpenProfile={() => navigate("/profile")}
        onDismiss={() => {
          dismissProfileEnhancement();
          setEnhancementDismissed(true);
        }}
      />
    ) : null;
  
  const handleConnectPhotoUploaded = useCallback(async () => {
    await refreshProfile({ silent: true });
    const count = await resolveReadyPhotoCount();
    setConnectPhotosModalCount(count);
    if (count >= MIN_PHOTOS_TO_CONNECT) {
      setShowConnectPhotosModal(false);
    }
  }, [refreshProfile, resolveReadyPhotoCount]);

  const connectGateModals = (
    <>
      <ConnectPhotosRequiredModalWeb
        open={showConnectPhotosModal}
        photoCount={connectPhotosModalCount}
        onClose={() => setShowConnectPhotosModal(false)}
        onPhotoUploaded={() => void handleConnectPhotoUploaded()}
      />
      <MatchmakingPausedModalWeb
        open={showMatchmakingPausedModal}
        message={user?.matchmakingDisabledMessage}
        onClose={() => setShowMatchmakingPausedModal(false)}
      />
    </>
  );

  if (!authLoading && !userProfile) {
    return <Navigate to="/create-profile" replace />;
  }

  /* Full-page loading only before first browse payload; offset refetches keep the stack mounted */
  if (authLoading || (loading && !hasFetched)) {
    return <BrowseConnectLandingChrome mode="loading" />;
  }

  if (showConnectGate) {
    return (
      <>
        <BrowseConnectLandingChrome
          mode="gate"
          onConnect={handleUnlockBrowse}
          unlocking={unlockingBrowse}
          gateError={gateError}
          enhancementSlot={enhancementSlot}
        />
        {connectGateModals}
      </>
    );
  }

  return (
    <div className="browse-page-native native-app-screen">
      {connectGateModals}
      {isAutoMatching ? <BrowseConnectLandingChrome mode="auto-connecting" /> : null}

      {matchNotification &&
        !showMatchCelebration &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              top: "max(20px, env(safe-area-inset-top, 0px))",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor:
                matchNotification.type === "success" ? "#10b981" : "#ef4444",
              color: "white",
              padding: "16px 24px",
              borderRadius: "8px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              zIndex: 13000,
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
          </div>,
          document.body
        )}

      {browseSessionActive &&
        hasFetched &&
        !currentProfile &&
        !loading &&
        !isAutoMatching ? (
        <div className="browse-native-caught-up">
          <div className="browse-native-caught-up-card">
            <div className="browse-native-caught-up-ring">🔍</div>
            <h2>You're all caught up</h2>
            <p>
              You&apos;ve seen everyone for now. Check back later for new people.
            </p>
          </div>
        </div>
      ) : browseSessionActive &&
        hasFetched &&
        currentProfile &&
        !showMatchCelebration &&
        !isAutoMatching ? (
        <>
          <div className="browse-native-token-fixed">
            <TokenDisplay />
          </div>
          <div className="browse-native-scroll">
            <header className="browse-native-header">
              <h1>Discover People</h1>
              <ConnectLandingTagline className="browse-native-header-tagline" />
            </header>
            {error && (
              <div className="browse-native-error" role="alert">
                ⚠️ {error}
              </div>
            )}
            <div className="browse-native-card-shell">
              <article className="browse-native-card">
                <div className="browse-native-card-photo-wrap">
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
                </div>
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
              className="browse-native-connect-btn browse-native-connect-btn--effects"
              onClick={() => !connecting && handleConnect(currentProfile)}
              disabled={connecting}
            >
              <ConnectButtonEffects active={!connecting} borderRadius={28}>
                {connecting ? "Connecting..." : "Connect & Match 🎟️"}
              </ConnectButtonEffects>
            </button>
          </div>
        </>
      ) : null}

      <WebPushOnboardingPrompt
        open={showWebPushPrompt}
        onClose={() => setShowWebPushPrompt(false)}
      />

      {showMatchCelebration && matchedProfile ? (
        <MatchCelebration
          profileName={matchedProfile.displayName}
          photoUrl={
            (matchedProfile.photos?.find((p) => p.isPrimary) || matchedProfile.photos?.[0])?.url ??
            matchedProfile.photoUrl ??
            celebrationPhotoGalleryUrls[0]
          }
          photoGalleryUrls={
            celebrationPhotoGalleryUrls.length > 0 ? celebrationPhotoGalleryUrls : undefined
          }
          partnerProfileDetail={celebrationPartnerDetail}
          matchId={celebrationMatchId}
          revealWhenMatchIdReady
          onKeepBrowsing={handleCelebrationKeepBrowsing}
          onOpenChat={handleCelebrationOpenChat}
        />
      ) : null}
    </div>
  );
}
