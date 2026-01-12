import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import PhotoUpload from '../components/PhotoUpload'
import { getPhotoUrl } from '../utils/photoUrl'

interface ProfileData {
  profile: {
    id: string
    display_name: string
    age: number
    gender: string
    location: string | null
    bio: string | null
    photo_url: string | null
    looking_for: string | null
  }
  interests: Array<{ name: string; category: string | null }>
  preferences: {
    min_age: number
    max_age: number
    preferred_genders: string | null
    max_distance: number
    relationship_type: string | null
  } | null
  dealbreakers: Array<{ description: string; category: string | null }>
  partnerQualities: Array<{ quality: string; importance: number }>
  lifestyle: {
    smoking: string | null
    drinking: string | null
    children: string | null
    pets: string | null
    religion: string | null
    work_life_balance: string | null
    works_out: string | null
  } | null
}

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

export default function MyProfile() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Reset state when component mounts
    setError('')
    setLoading(true)
    fetchProfile()
    fetchPhotos()

    // Cleanup: cancel any pending requests when component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const fetchPhotos = async () => {
    try {
      console.log('🔄 Fetching photos...');
      const data = await api.get<{ photos: Photo[] }>("/photos/me");
      console.log('✅ Photos fetched:', data.photos);
      setPhotos(data.photos || []);
    } catch (err) {
      console.error('❌ Failed to fetch photos:', err);
      // Photos might not exist yet, that's okay
      setPhotos([]);
    }
  }

  const fetchProfile = async () => {
    try {
      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()

      // Note: The api.get doesn't currently accept an AbortSignal, but we'll handle cleanup
      const profileData = await api.get<ProfileData>('/profile')
      
      // Check if component is still mounted (request wasn't aborted)
      if (abortControllerRef.current?.signal.aborted) {
        return
      }

      setData(profileData)
      setError('')
    } catch (err: any) {
      // Ignore aborted requests
      if (err?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return
      }
      
      // Handle 404 specifically (profile not found)
      if (err?.response?.status === 404 || err?.status === 404) {
        setError('')
        setData(null) // Clear data to show "Create Profile" UI
      } else {
        // For other errors, show the error message
        const errorMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load profile'
        setError(errorMessage)
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false)
      }
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading your profile...</div>
  }

  if (error || !data) {
    return (
      <div className="no-profiles">
        <div className="no-profiles-icon">😕</div>
        <p>{error || 'Profile not found'}</p>
        <Link to="/create-profile" className="btn btn-primary mt-4">
          Create Profile
        </Link>
      </div>
    )
  }

      const { profile, interests, dealbreakers, partnerQualities, lifestyle } = data

  // Get primary photo or first photo
  const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : (profile.photo_url ? getPhotoUrl(profile.photo_url) : null);
  
  console.log('📸 Profile photo debug:', {
    photosCount: photos.length,
    photos: photos,
    primaryPhoto: primaryPhoto,
    profilePhotoUrl: profilePhotoUrl,
    profilePhotoUrlFromProfile: profile.photo_url
  });

  return (
    <div className="my-profile">
      <div className="my-profile-header">
        {profilePhotoUrl && (
          <div className="my-profile-avatar">
            <img 
              src={profilePhotoUrl} 
              alt={profile.display_name}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="my-profile-info">
          <h1 className="my-profile-name">{profile.display_name}</h1>
          <div className="my-profile-meta-group">
            <div className="my-profile-meta-item">
              <span className="my-profile-meta-label">Age</span>
              <span className="my-profile-meta-value">{profile.age}</span>
            </div>
            <div className="my-profile-meta-item">
              <span className="my-profile-meta-label">Gender</span>
              <span className="my-profile-meta-value">{profile.gender}</span>
            </div>
            {profile.location && (
              <div className="my-profile-meta-item">
                <span className="my-profile-meta-label">Location</span>
                <span className="my-profile-meta-value">{profile.location}</span>
              </div>
            )}
            {profile.looking_for && (
              <div className="my-profile-meta-item">
                <span className="my-profile-meta-label">Looking for</span>
                <span className="my-profile-meta-value">{profile.looking_for}</span>
              </div>
            )}
          </div>
          {profile.bio && (
            <div className="my-profile-bio-container">
              <p className="my-profile-bio">{profile.bio}</p>
            </div>
          )}
        </div>
      </div>

      <div className="profile-detail-section">
        <h2 className="profile-detail-title">
          <span>📸</span> My Photos
        </h2>
        <PhotoUpload onPhotosUpdated={() => { fetchProfile(); fetchPhotos(); }} />
      </div>

      {interests.length > 0 && (
        <div className="profile-detail-section">
          <h2 className="profile-detail-title">
            <span>🎯</span> My Interests
          </h2>
          <div className="profile-card-interests">
            {interests.map((interest, idx) => (
              <span key={idx} className="interest-tag">{interest.name}</span>
            ))}
          </div>
        </div>
      )}

      {dealbreakers.length > 0 && (
        <div className="profile-detail-section">
          <h2 className="profile-detail-title">
            <span>🚫</span> My Dealbreakers
          </h2>
          <div className="profile-card-interests">
            {dealbreakers.map((db, idx) => (
              <span key={idx} className="interest-tag">{db.description}</span>
            ))}
          </div>
        </div>
      )}

      {partnerQualities.length > 0 && (
        <div className="profile-detail-section">
          <h2 className="profile-detail-title">
            <span>💕</span> What I'm Looking For
          </h2>
          <div className="profile-card-interests">
            {partnerQualities.map((q, idx) => (
              <span key={idx} className="interest-tag">{q.quality}</span>
            ))}
          </div>
        </div>
      )}

      {lifestyle && (
        <div className="profile-detail-section">
          <h2 className="profile-detail-title">
            <span>🌱</span> Lifestyle
          </h2>
          <div className="profile-lifestyle">
            {lifestyle.smoking && (
              <div className="lifestyle-item">
                <strong>Smoking:</strong> {lifestyle.smoking}
              </div>
            )}
            {lifestyle.drinking && (
              <div className="lifestyle-item">
                <strong>Drinking:</strong> {lifestyle.drinking}
              </div>
            )}
            {lifestyle.children && (
              <div className="lifestyle-item">
                <strong>Children:</strong> {lifestyle.children}
              </div>
            )}
            {lifestyle.pets && (
              <div className="lifestyle-item">
                <strong>Pets:</strong> {lifestyle.pets}
              </div>
            )}
            {lifestyle.religion && (
              <div className="lifestyle-item">
                <strong>Religion:</strong> {lifestyle.religion}
              </div>
            )}
            {lifestyle.work_life_balance && (
              <div className="lifestyle-item">
                <strong>Work-Life Balance:</strong> {lifestyle.work_life_balance}
              </div>
            )}
            {lifestyle.works_out && (
              <div className="lifestyle-item">
                <strong>Works out:</strong> {lifestyle.works_out}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-center mt-8">
        <Link to="/create-profile" className="btn btn-secondary">
          Edit Profile
        </Link>
      </div>
    </div>
  )
}

