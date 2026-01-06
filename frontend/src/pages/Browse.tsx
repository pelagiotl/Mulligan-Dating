import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
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
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, [offset]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ profile: Profile | null; hasMore: boolean; offset: number; total: number }>(`/users/browse?offset=${offset}`);
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
    } catch (err) {
      if (err instanceof Error && err.message.includes("complete your profile")) {
        navigate("/create-profile");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

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
    return <div className="loading-screen">Finding amazing people...</div>;
  }

  if (error) {
    return (
      <div className="no-profiles">
        <div className="no-profiles-icon">😕</div>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="browse-header">
        <h1 className="browse-title">Discover People</h1>
        <p className="browse-subtitle">
          Find someone who shares your interests and values
        </p>
        <TokenDisplay />
      </div>

      {!currentProfile && !loading ? (
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
