import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { getPhotoUrl } from "../utils/photoUrl";
import MatchCelebration from "./MatchCelebration";

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
}

interface ProfileModalProps {
  profile: Profile;
  onClose: () => void;
  onConnect: () => void;
}

export default function ProfileModal({ profile, onClose, onConnect }: ProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasPendingMatch, setHasPendingMatch] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [blocking, setBlocking] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);

  useEffect(() => {
    checkStatus();
    fetchPhotos();
  }, [profile.userId, profile.id]);

  const fetchPhotos = async () => {
    try {
      const data = await api.get<{ photos: Photo[] }>(`/photos/profile/${profile.id}`);
      setPhotos(data.photos);
    } catch {
      // Photos might not exist yet
      setPhotos([]);
    }
  };

  const checkStatus = async () => {
    try {
      // Check if this user already sent us a match request
      const pendingData = await api.get<{ hasPendingMatch: boolean }>(
        `/matches/pending-from/${profile.userId}`
      );
      setHasPendingMatch(pendingData.hasPendingMatch);

      // Get token count
      const tokenData = await api.get<{ availableTokens: number }>("/tokens");
      setTokenCount(tokenData.availableTokens);
    } catch {
      // Ignore errors here
    }
  };

  const handleConnect = async (expandSlot?: boolean) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await api.post<{ message: string; isMutual: boolean }>(
        "/matches/connect",
        { targetUserId: profile.userId, expandSlot: expandSlot || false }
      );

      setSuccess(result.message);
      
      // Show match celebration animation
      setShowMatchCelebration(true);
      
      // Close after celebration (handled by MatchCelebration component)
    } catch (err) {
      // Check if at match limit - offer to expand slot with extra token
      if (err instanceof Error && "status" in err) {
        const apiErr = err as Error & { status: number; code?: string; canExpand?: boolean; currentLimit?: number; newLimit?: number };
        if (apiErr.status === 400 && apiErr.code === "AT_MATCH_LIMIT" && apiErr.canExpand) {
          const currentLimit = apiErr.currentLimit ?? 7;
          const newLimit = apiErr.newLimit ?? 8;
          setLoading(false);
          const ok = window.confirm(
            `You've reached your limit of ${currentLimit} matches. You need 2 Mulligan tokens (1 for the match + 1 for the extra slot). Spend 2 tokens to connect?`
          );
          if (ok) {
            handleConnect(true);
          }
          return;
        }
      }
      // Handle other error messages
      if (err instanceof Error) {
        const errorMessage = err.message;
        if (errorMessage.includes("need") && errorMessage.includes("photos")) {
          setError(errorMessage);
        } else {
          setError(errorMessage);
        }
      } else {
        setError("Failed to connect");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!confirm(`Are you sure you want to block ${profile.displayName}? You won't see each other anymore.`)) {
      return;
    }

    setBlocking(true);
    try {
      await api.post("/blocks", { blockedUserId: profile.userId });
      onConnect(); // Close modal and refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to block user");
    } finally {
      setBlocking(false);
    }
  };

  // Get primary photo for match celebration
  const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];
  const photoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : (profile.photoUrl ? getPhotoUrl(profile.photoUrl) : undefined);

  return (
    <>
      {showMatchCelebration && (
        <MatchCelebration
          profileName={profile.displayName}
          photoUrl={photoUrl}
          onClose={() => {
            setShowMatchCelebration(false);
            onConnect();
          }}
        />
      )}
      <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="profile-modal">
          <div className="profile-modal-header">
            <div className="profile-modal-avatar blurred">
              {photos.length > 0 ? (
                <img 
                  src={getPhotoUrl(photos.find(p => p.isPrimary)?.url || photos[0].url)} 
                  alt={profile.displayName}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : profile.photoUrl ? (
                <img src={getPhotoUrl(profile.photoUrl)} alt={profile.displayName} onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }} />
              ) : (
                "👤"
              )}
              <div className="blur-overlay-small">🔒</div>
            </div>
            <div className="profile-modal-info">
              <h2 className="profile-modal-name">{profile.displayName}</h2>
              <p className="profile-modal-meta">
                {profile.age} years old · {profile.gender}
              </p>
              {profile.location && (
                <p className="profile-modal-location">📍 {profile.location}</p>
              )}
            </div>
          </div>

          {profile.lookingFor && (
            <div className="profile-modal-section">
              <h3>Looking for</h3>
              <p>{profile.lookingFor}</p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="profile-modal-section">
              <h3>Photos</h3>
              <div className="profile-modal-photos">
                {photos.map((photo) => (
                  <div key={photo.id} className="profile-modal-photo blurred">
                    <img src={getPhotoUrl(photo.url)} alt={`${profile.displayName} photo ${photo.displayOrder + 1}`} onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }} />
                    <div className="blur-overlay-small">🔒</div>
                  </div>
                ))}
              </div>
              <p className="photo-hint">🔒 Photos will be revealed after matching</p>
            </div>
          )}

          {profile.bio && (
            <div className="profile-modal-section">
              <h3>About</h3>
              <p>{profile.bio}</p>
            </div>
          )}

          {profile.interests.length > 0 && (
            <div className="profile-modal-section">
              <h3>Interests</h3>
              <div className="profile-card-interests">
                {profile.interests.map((interest) => (
                  <span key={interest} className="interest-tag">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="profile-modal-actions">
            {hasPendingMatch ? (
              <div className="pending-match-notice">
                <span className="pending-icon">💫</span>
                <p>This person already wants to connect with you!</p>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => handleConnect()}
                  disabled={loading || tokenCount === 0}
                >
                  {loading ? "Connecting..." : "Match Back! 💘"}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-lg w-full"
                onClick={() => handleConnect()}
                disabled={loading || tokenCount === 0}
              >
                {loading ? (
                  "Sending..."
                ) : tokenCount === 0 ? (
                  "No tokens available"
                ) : (
                  <>
                    <span className="token-icon">🎟️</span> Use Token to Connect
                  </>
                )}
              </button>
            )}

            {tokenCount === 0 && !success && (
              <p className="token-hint">
                Claim your weekly tokens to connect with people!
              </p>
            )}

            <p className="connect-note">
              🔒 Photos stay hidden until you both agree to reveal
            </p>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleBlock}
              disabled={blocking}
              style={{ marginTop: "1rem", width: "100%" }}
            >
              {blocking ? "Blocking..." : "🚫 Block User"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

