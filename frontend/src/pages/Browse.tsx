import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { getPhotoUrl } from "../utils/photoUrl";
import MatchCelebration from "../components/MatchCelebration";
import TokenDisplay from "../components/TokenDisplay";
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

export default function Browse() {
  const { profile: userProfile } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true); // Used in fetchProfile
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [hasFetched, setHasFetched] = useState(false); // Track if we've fetched at least once
  const [matchNotification, setMatchNotification] = useState<{ message: string; type: "success" | "info" | "warning" | "error" } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();

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

  // Initial fetch on mount - only once
  useEffect(() => {
    if (!hasFetched) {
      console.log('🔵 Initial mount - fetching profile');
      // Clear error state when component mounts
      setError("");
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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

  const handleConnect = async (profile: Profile) => {
    if (connecting) return; // Prevent double-clicks
    
    setConnecting(true);
    setError("");
    
    // Play cool connect sound when connecting
    playConnectSound();
    
    try {
      // Consume token and create match immediately
      const result = await api.post<{ message: string; isMutual: boolean; matchId: string; stage: string }>(
        "/matches/connect",
        { targetUserId: profile.userId }
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
          const apiErr = err as Error & { status: number };
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

  // Check if user needs to create profile
  // Use AuthContext profile state as the source of truth
  // If userProfile exists in AuthContext, they have a profile
  const needsProfile = !userProfile && !loading;
  
  // If there's an error but we don't have a profile, treat it as a profile creation issue
  // This is a fallback to ensure users can always create a profile
  if (error && !userProfile && !loading) {
    console.log('Error detected but no profile - showing create profile option:', error);
    // Don't return error, show create profile button instead
  }

  // Render loading screen
  if (loading) {
    return (
      <div className="loading-screen-immersive">
        <div className="loading-bg-gradient"></div>
        <div className="loading-particles">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="loading-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        <div className="loading-orbs">
          <div className="loading-orb loading-orb-1"></div>
          <div className="loading-orb loading-orb-2"></div>
          <div className="loading-orb loading-orb-3"></div>
        </div>
        <div className="loading-content">
          <div className="loading-logo-container">
            <svg className="loading-logo" width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="loadingHeartGradientBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
                <filter id="loadingGlowBrowse">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path 
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                fill="url(#loadingHeartGradientBrowse)"
                filter="url(#loadingGlowBrowse)"
              />
            </svg>
          </div>
          <h1 className="loading-title">Finding Amazing People</h1>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
          <p className="loading-subtitle">Searching for your perfect match</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Match notification */}
      {matchNotification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: matchNotification.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            padding: '16px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            maxWidth: '90%',
            textAlign: 'center',
            cursor: 'pointer',
          }}
          onClick={() => {
            setMatchNotification(null);
            navigate('/matches');
          }}
        >
          {matchNotification.message}
        </div>
      )}

      <div className="browse-header">
        <TokenDisplay />
        <h1 className="browse-title">Discover People</h1>
        <p className="browse-subtitle">
          Find someone who shares your interests and values
        </p>
      </div>

      {needsProfile ? (
        <>
          <div className="profile-arrow-indicator">
            <div className="arrow-line"></div>
            <div className="arrow-head">↓</div>
          </div>
          {error && (
            <div style={{ 
              textAlign: 'center', 
              marginTop: 'var(--space-4)', 
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              padding: '0 var(--space-4)'
            }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button 
              onClick={() => navigate("/create-profile")}
              className="browse-connect-button immersive-button"
            >
              <span className="button-glow"></span>
              <span className="button-shine"></span>
              <span className="button-content">
                Create Profile <span className="rocket-emoji">🚀</span>
              </span>
            </button>
          </div>
        </>
      ) : !currentProfile && !loading ? (
        <div className="no-profiles">
          <div className="no-profiles-icon">🔍</div>
          <h2>No more profiles</h2>
          <p>You've seen everyone! Check back later for new people.</p>
        </div>
      ) : currentProfile ? (
        <div className="browse-immersive-container">
          {error && (
            <div style={{ 
              textAlign: 'center', 
              marginBottom: 'var(--space-4)', 
              color: 'var(--error-color, #ef4444)',
              fontSize: '0.9rem',
              padding: 'var(--space-3) var(--space-4)',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              margin: '0 auto var(--space-4)',
              maxWidth: '600px'
            }}>
              ⚠️ {error}
            </div>
          )}
          <div className="button-wrapper">
            <div className="sparkle sparkle-1">✨</div>
            <div className="sparkle sparkle-2">💫</div>
            <div className="sparkle sparkle-3">⭐</div>
            <div className="sparkle sparkle-4">✨</div>
            <div className="sparkle sparkle-5">💫</div>
            <div className="sparkle sparkle-6">⭐</div>
            <div className="particle-ring ring-1"></div>
            <div className="particle-ring ring-2"></div>
            <div className="particle-ring ring-3"></div>
            <button 
              className={`browse-connect-button immersive-button ${connecting ? 'connecting' : ''}`}
              onClick={() => !connecting && handleConnect(currentProfile)}
              disabled={connecting}
            >
              <span className="button-glow"></span>
              <span className="button-shine"></span>
              <span className="button-content">
                {connecting ? "Connecting..." : "Connect (Use Token) 🎟️"}
              </span>
              <span className="button-particles">
                <span className="particle"></span>
                <span className="particle"></span>
                <span className="particle"></span>
                <span className="particle"></span>
                <span className="particle"></span>
              </span>
            </button>
          </div>
        </div>
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
