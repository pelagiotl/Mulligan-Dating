import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import MatchCelebration from "../components/MatchCelebration";
import TokenDisplay from "../components/TokenDisplay";

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
  const navigate = useNavigate();

  // Define fetchProfile first with useCallback before using it in useEffect
  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(""); // Clear any previous errors
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - server may be starting up')), 30000);
      });
      
      const data = await Promise.race([
        api.get<{ profile: Profile | null; hasMore: boolean; offset: number; total: number }>(`/users/browse?offset=${offset}`),
        timeoutPromise
      ]) as { profile: Profile | null; hasMore: boolean; offset: number; total: number };
      
      if (data.profile) {
        // Fetch photos for this profile
        try {
          const photosData = await api.get<{ photos: Photo[] }>(`/photos/profile/${data.profile.id}`);
          data.profile.photos = photosData.photos;
        } catch {
          // Photos might not exist yet, that's okay
          data.profile.photos = [];
        }
      }
      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
      
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
      console.error('Browse fetchProfile error:', {
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
        console.log('Profile missing detected, showing create profile button');
        setCurrentProfile(null);
        setError(""); // Clear any error state
        setLoading(false);
        return;
      }
      
      // For other errors, show them but also log for debugging
      console.error('Non-profile error in Browse:', errorMessage);
      setError(errorMessage);
    } finally {
      // Always set loading to false, even if there's an error
      setLoading(false);
    }
  }, [offset]);

  // Initial fetch on mount
  useEffect(() => {
    // Clear error state when component mounts or offset changes
    setError("");
    fetchProfile();
  }, [fetchProfile]);

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
      await api.post<{ message: string; isMutual: boolean; matchId: string }>(
        "/matches/connect",
        { targetUserId: profile.userId }
      );

      // Show match celebration
      setMatchedProfile(profile);
      setShowMatchCelebration(true);
    } catch (err) {
      // Show error
      if (err instanceof Error) {
        setError(err.message);
        // Clear error after 5 seconds
        setTimeout(() => setError(""), 5000);
      }
      setConnecting(false);
    }
  };

  const handleCelebrationClose = () => {
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setConnecting(false);
    // Move to next profile after celebration
    setOffset(prev => prev + 1);
  };

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
                  <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
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
  
  // If user just created a profile, refresh the browse page
  useEffect(() => {
    if (userProfile && !loading && !currentProfile) {
      // Profile exists in AuthContext - try to fetch browse profiles
      console.log('Profile exists in AuthContext, refreshing browse...');
      fetchProfile();
    }
  }, [userProfile, loading, currentProfile, fetchProfile]);

  return (
    <div>
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

      {showMatchCelebration && matchedProfile && (
        <MatchCelebration
          profileName={matchedProfile.displayName}
          photoUrl={matchedProfile.photos?.find(p => p.isPrimary)?.url || matchedProfile.photos?.[0]?.url || matchedProfile.photoUrl}
          onClose={handleCelebrationClose}
        />
      )}
    </div>
  );
}
