import { useState, useEffect, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Other', 'Prefer not to say']
const LOOKING_FOR_OPTIONS = ['Relationship', 'Something casual', 'Friendship', 'Not sure yet']

const INTEREST_OPTIONS = [
  'Travel', 'Music', 'Sports', 'Cooking', 'Reading', 'Movies', 'Fitness', 'Art',
  'Photography', 'Dancing', 'Gaming', 'Hiking', 'Yoga', 'Writing', 'Technology',
  'Fashion', 'Animals', 'Volunteering', 'Coffee', 'Nightlife', 'Comedy',
  'Beach', 'Camping', 'Board Games', 'Tattoos', 'Meditation', 'History', 'Science',
  'Business', 'Education'
]

const DEALBREAKER_OPTIONS = [
  'Smokes cigarettes', 'Marijuana', 'Frequent drinking', 'Drug use', 
  'Doesn\'t want children', 'Wants children',
  'Poor communication', 'No ambition',
  'Doesn\'t like pets'
]

// Partner qualities now use the same options as interests
// (Removed separate PARTNER_QUALITY_OPTIONS - using INTEREST_OPTIONS instead)

export default function CreateProfile() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Basic Info
  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [detectingLocation, setDetectingLocation] = useState(false)

  // Step 2: Interests
  const [interests, setInterests] = useState<string[]>([])

  // Step 3: Dealbreakers & Partner Qualities
  const [dealbreakers, setDealbreakers] = useState<string[]>([])
  const [qualities, setQualities] = useState<string[]>([])

  // Step 4: Dating Preferences
  const [minAge, setMinAge] = useState(18)
  const [preferredGenders, setPreferredGenders] = useState<string[]>([])
  const [maxDistance, setMaxDistance] = useState(50)

  // Step 5: Lifestyle
  const [smoking, setSmoking] = useState('')
  const [drinking, setDrinking] = useState('')
  const [children, setChildren] = useState('')
  const [pets, setPets] = useState('')
  const [religion, setReligion] = useState('')
  const [workLifeBalance, setWorkLifeBalance] = useState('')
  const [worksOut, setWorksOut] = useState('')

  const handleAddTag = (
    input: string,
    setInput: (s: string) => void,
    list: string[],
    setList: (l: string[]) => void
  ) => {
    const value = input.trim()
    if (value && !list.includes(value)) {
      setList([...list, value])
      setInput('')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRemoveTag = (value: string, list: string[], setList: (l: string[]) => void) => {
    setList(list.filter(item => item !== value))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    input: string,
    setInput: (s: string) => void,
    list: string[],
    setList: (l: string[]) => void
  ) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag(input, setInput, list, setList)
    }
  }

  const handleNext = () => {
    if (step === 1) {
      // Validate all required fields
      if (!displayName || !displayName.trim()) {
        setError('Please enter your display name')
        return
      }
      if (displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters')
        return
      }
      if (!age || !age.trim()) {
        setError('Please enter your age')
        return
      }
      const ageNum = parseInt(age)
      if (isNaN(ageNum)) {
        setError('Please enter a valid age')
        return
      }
      if (ageNum < 18) {
        setError('You must be at least 18 years old')
        return
      }
      if (ageNum > 120) {
        setError('Please enter a valid age')
        return
      }
      if (!gender || !gender.trim()) {
        setError('Please select your gender')
        return
      }
    }
    if (step === 2) {
      // Validate at least 3 interests are selected
      if (interests.length < 3) {
        setError('Please select at least 3 interests')
        return
      }
    }
    if (step === 3) {
      // Validate at least 3 partner qualities (interests) are selected
      if (qualities.length < 3) {
        setError('Please select at least 3 interests you want in a partner')
        return
      }
    }
    if (step === 4) {
      // Validate minimum age is at least 18
      if (minAge < 18) {
        setError('Minimum age must be 18 or older')
        return
      }
    }
    if (step === 5) {
      // Validate all lifestyle fields are filled
      if (!smoking || !drinking || !children || !pets || !religion || !workLifeBalance || !worksOut) {
        setError('Please fill in all lifestyle fields')
        return
      }
    }
    setError('')
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  // Load existing profile data when component mounts
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await api.get<{
          profile: {
            display_name: string
            age: number
            gender: string
            location: string | null
            bio: string | null
            looking_for: string | null
          }
          interests: Array<{ name: string }>
          dealbreakers: Array<{ description: string }>
          partnerQualities: Array<{ quality: string }>
          preferences: {
            min_age: number
            max_age: number
            preferred_genders: string | null
            max_distance: number
          } | null
          lifestyle: {
            smoking: string | null
            drinking: string | null
            children: string | null
            pets: string | null
            religion: string | null
            work_life_balance: string | null
          } | null
        }>('/profile')

        if (data.profile) {
          setDisplayName(data.profile.display_name)
          setAge(data.profile.age.toString())
          setGender(data.profile.gender)
          setLocation(data.profile.location || '')
          setBio(data.profile.bio || '')
          setLookingFor(data.profile.looking_for || '')
          
          if (data.interests) {
            setInterests(data.interests.map(i => i.name))
          }
          
          if (data.dealbreakers) {
            setDealbreakers(data.dealbreakers.map(d => d.description))
          }
          
          if (data.partnerQualities) {
            setQualities(data.partnerQualities.map(q => q.quality))
          }
          
          if (data.preferences) {
            setMinAge(data.preferences.min_age)
            setMaxDistance(data.preferences.max_distance)
            if (data.preferences.preferred_genders) {
              try {
                const genders = JSON.parse(data.preferences.preferred_genders) as string[]
                setPreferredGenders(genders)
              } catch {
                setPreferredGenders([])
              }
            }
          }
          
          if (data.lifestyle) {
            setSmoking(data.lifestyle.smoking || '')
            setDrinking(data.lifestyle.drinking || '')
            setChildren(data.lifestyle.children || '')
            setPets(data.lifestyle.pets || '')
            setReligion(data.lifestyle.religion || '')
            setWorkLifeBalance(data.lifestyle.work_life_balance || '')
            setWorksOut(data.lifestyle.works_out || '')
          }
        }
      } catch (err) {
        // Profile doesn't exist yet, that's okay - user is creating new profile
        console.log('No existing profile found, creating new one')
      }
    }

    loadProfile()
  }, [])

  // Don't auto-trigger - let user click the button instead
  // This gives them control and explains why we need location

  /**
   * Detect user's location using browser geolocation (web) or native location (React Native)
   * For iOS native apps, this will use React Native's location API which shows native iOS permission dialog
   */
  const detectLocation = async () => {
    // Check if we're in a React Native environment
    const isReactNative = typeof (window as any).ReactNativeWebView !== 'undefined' || 
                         typeof (navigator as any).product === 'ReactNative'
    
    if (!isReactNative && !navigator.geolocation) {
      console.log('Geolocation is not supported by this browser')
      return
    }

    setDetectingLocation(true)
    
    try {
      let latitude: number, longitude: number
      
      if (isReactNative) {
        // For React Native, use native location API
        // This will show native iOS permission dialog (in-app notification)
        // Note: You'll need to install @react-native-community/geolocation or expo-location
        // For now, this is a placeholder - will need to be implemented in React Native app
        console.log('📍 React Native location detection - will use native iOS permission dialog')
        throw new Error('React Native location not yet implemented - use native location library')
      } else {
        // Web: Use browser geolocation API
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          })
        })
        
        latitude = position.coords.latitude
        longitude = position.coords.longitude
      }

      console.log('📍 Got coordinates:', { latitude, longitude })

      // Reverse geocode using Nominatim (free, no API key needed)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Mulligan-Dating-App/1.0' // Required by Nominatim
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to reverse geocode location')
      }

      const data = await response.json()
      console.log('📍 Reverse geocode result:', data)

      // Extract city and state from address
      const address = data.address || {}
      const city = address.city || address.town || address.village || address.municipality || ''
      const state = address.state || address.region || ''
      const country = address.country || ''

      // Format as "City, State" (US/Canada) or "City, Country" (international)
      if (country === 'United States' || country === 'Canada') {
        if (city && state) {
          setLocation(`${city}, ${state}`)
          console.log('✅ Auto-filled location:', `${city}, ${state}`)
        } else if (city) {
          setLocation(city)
          console.log('✅ Auto-filled location:', city)
        }
      } else if (city && country) {
        setLocation(`${city}, ${country}`)
        console.log('✅ Auto-filled location:', `${city}, ${country}`)
      } else if (city) {
        setLocation(city)
        console.log('✅ Auto-filled location:', city)
      }
    } catch (error: any) {
      console.log('⚠️  Could not detect location:', error.message)
      // Silently fail - user can still enter location manually
    } finally {
      setDetectingLocation(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate at least 3 interests are selected
    if (interests.length < 3) {
      setError('Please select at least 3 interests before completing your profile')
      setLoading(false)
      return
    }

    // Validate at least 3 partner qualities (interests) are selected
    if (qualities.length < 3) {
      setError('Please select at least 3 interests you want in a partner before completing your profile')
      setLoading(false)
      return
    }

    // Always validate all lifestyle fields are filled before completing profile
    if (!smoking || !drinking || !children || !pets || !religion || !workLifeBalance || !worksOut) {
      setError('Please fill in all lifestyle fields before completing your profile')
      setLoading(false)
      return
    }

    try {
      console.log('🚀 Starting profile creation...');
      
      // Create profile
      console.log('📝 Step 1: Creating profile...');
      await api.post('/profile', {
        displayName,
        age: parseInt(age),
        gender,
        location,
        bio,
        lookingFor
      })
      console.log('✅ Profile created successfully');

      // Add interests
      if (interests.length > 0) {
        console.log('📝 Step 2: Adding interests...', interests);
        await api.put('/profile/interests', {
          interests: interests.map(name => ({ name }))
        })
        console.log('✅ Interests added successfully');
      }

      // Add dealbreakers
      if (dealbreakers.length > 0) {
        console.log('📝 Step 3: Adding dealbreakers...', dealbreakers);
        await api.put('/profile/dealbreakers', {
          dealbreakers: dealbreakers.map(description => ({ description }))
        })
        console.log('✅ Dealbreakers added successfully');
      }

      // Add partner qualities
      if (qualities.length > 0) {
        console.log('📝 Step 4: Adding partner qualities...', qualities);
        await api.put('/profile/partner-qualities', {
          qualities: qualities.map(quality => ({ quality }))
        })
        console.log('✅ Partner qualities added successfully');
      }

      // Save dating preferences
      console.log('📝 Step 5: Saving preferences...');
      await api.put('/profile/preferences', {
        minAge,
        maxAge: null, // No maximum age limit
        preferredGenders: preferredGenders.length > 0 ? preferredGenders : null,
        maxDistance,
        relationshipType: lookingFor || null
      })
      console.log('✅ Preferences saved successfully');

      // Save lifestyle (all fields are required)
      console.log('📝 Step 6: Saving lifestyle...');
      await api.put('/profile/lifestyle', {
        smoking,
        drinking,
        children,
        pets,
        religion,
        workLifeBalance,
        worksOut
      })
      console.log('✅ Lifestyle saved successfully');

      // Refresh profile to ensure it's loaded
      await refreshProfile()
      
      // Small delay to ensure profile is fully saved and state is updated
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Navigate to browse - the profile should now exist
      navigate('/browse')
    } catch (err) {
      console.error('❌ Profile creation error:', err)
      console.error('❌ Error details:', {
        message: err instanceof Error ? err.message : String(err),
        status: (err as any)?.status,
        response: (err as any)?.response
      })
      const errorMessage = err instanceof Error ? err.message : 'Failed to create profile'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-wizard">
      <div className="profile-wizard-header">
        <h1 className="profile-wizard-title">Create Your Profile</h1>
        <p className="profile-wizard-subtitle">
          Tell us about yourself so we can help you find your perfect match
        </p>
      </div>

      <div className="profile-step-indicator">
        <div className={`step-dot ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`} />
        <div className={`step-dot ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`} />
        <div className={`step-dot ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`} />
        <div className={`step-dot ${step >= 4 ? 'active' : ''} ${step > 4 ? 'completed' : ''}`} />
        <div className={`step-dot ${step >= 5 ? 'active' : ''}`} />
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="card">
        <div className="card-body">
          {step === 1 && (
            <div className="profile-section">
              <h2 className="profile-section-title">✨ The Basics</h2>
              
              <div className="profile-grid">
                <div className="form-group">
                  <label htmlFor="displayName" className="form-label">Display Name *</label>
                  <input
                    type="text"
                    id="displayName"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="What should we call you?"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="age" className="form-label">Age *</label>
                  <input
                    type="number"
                    id="age"
                    className="form-input"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="18+"
                    min="18"
                    max="120"
                    required
                  />
                </div>
              </div>

              <div className="profile-grid">
                <div className="form-group">
                  <label htmlFor="gender" className="form-label">Gender *</label>
                  <select
                    id="gender"
                    className="form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    required
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="location" className="form-label">
                    Location
                    {detectingLocation && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>
                        (Detecting your location...)
                      </span>
                    )}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      id="location"
                      className="form-input"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={detectingLocation ? "Detecting your location..." : "City, State"}
                      disabled={detectingLocation}
                      style={{ flex: 1 }}
                    />
                    {!detectingLocation && (
                      <button
                        type="button"
                        onClick={detectLocation}
                        style={{
                          padding: '0.75rem 1.25rem',
                          fontSize: '0.9rem',
                          background: '#f43f5e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s',
                          boxShadow: '0 2px 4px rgba(244, 63, 94, 0.2)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e11d48'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(244, 63, 94, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f43f5e'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(244, 63, 94, 0.2)'
                        }}
                      >
                        📍 Use My Location
                      </button>
                    )}
                  </div>
                  {!location && !detectingLocation && (
                    <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
                      We'll use your location to show you matches nearby. You can also type it manually.
                    </p>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="lookingFor" className="form-label">What are you looking for?</label>
                <select
                  id="lookingFor"
                  className="form-select"
                  value={lookingFor}
                  onChange={(e) => setLookingFor(e.target.value)}
                >
                  <option value="">Select an option</option>
                  {LOOKING_FOR_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="bio" className="form-label">About You</label>
                <textarea
                  id="bio"
                  className="form-textarea"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell potential matches a bit about yourself..."
                  maxLength={500}
                />
                <p className="form-hint">{bio.length}/500 characters</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="profile-section">
              <h2 className="profile-section-title">🎯 Your Interests</h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                What are you passionate about? Select at least 3 interests.
              </p>

              <div className="interests-grid">
                {INTEREST_OPTIONS.map(interest => (
                  <label key={interest} className="interest-checkbox">
                    <input
                      type="checkbox"
                      checked={interests.includes(interest)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setInterests([...interests, interest])
                        } else {
                          setInterests(interests.filter(i => i !== interest))
                        }
                      }}
                    />
                    <span>{interest}</span>
                  </label>
                ))}
              </div>
              <p className="form-hint" style={{ marginTop: 'var(--space-4)' }}>
                {interests.length} interest{interests.length !== 1 ? 's' : ''} selected {interests.length < 3 && <span style={{ color: 'var(--error)' }}>(minimum 3 required)</span>}
              </p>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="profile-section">
                <h2 className="profile-section-title">🚫 Your Dealbreakers</h2>
                <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                  What are the things you absolutely can't compromise on? Be honest!
                </p>

                <div className="interests-grid">
                  {DEALBREAKER_OPTIONS.map(dealbreaker => (
                    <label key={dealbreaker} className="interest-checkbox">
                      <input
                        type="checkbox"
                        checked={dealbreakers.includes(dealbreaker)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDealbreakers([...dealbreakers, dealbreaker])
                          } else {
                            setDealbreakers(dealbreakers.filter(d => d !== dealbreaker))
                          }
                        }}
                      />
                      <span>{dealbreaker}</span>
                    </label>
                  ))}
                </div>
                {dealbreakers.length > 0 && (
                  <p className="form-hint" style={{ marginTop: 'var(--space-4)' }}>
                    {dealbreakers.length} dealbreaker{dealbreakers.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <div className="profile-section">
                <h2 className="profile-section-title">💕 What You Want in a Partner</h2>
                <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                  What interests do you want your ideal match to share with you? Select at least 3.
                </p>

                <div className="interests-grid">
                  {INTEREST_OPTIONS.map(interest => (
                    <label key={interest} className="interest-checkbox">
                      <input
                        type="checkbox"
                        checked={qualities.includes(interest)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setQualities([...qualities, interest])
                          } else {
                            setQualities(qualities.filter(q => q !== interest))
                          }
                        }}
                      />
                      <span>{interest}</span>
                    </label>
                  ))}
                </div>
                <p className="form-hint" style={{ marginTop: 'var(--space-4)' }}>
                  {qualities.length} interest{qualities.length !== 1 ? 's' : ''} selected {qualities.length < 3 && <span style={{ color: 'var(--error)' }}>(minimum 3 required)</span>}
                </p>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="profile-section">
              <h2 className="profile-section-title">💕 Dating Preferences</h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Who are you looking for? Set your preferences to see the best matches.
              </p>

              <div className="form-group">
                <label htmlFor="minAge" className="form-label">Minimum Age</label>
                <input
                  type="number"
                  id="minAge"
                  className="form-input"
                  min="18"
                  max="120"
                  value={minAge}
                  onChange={(e) => {
                    const inputValue = e.target.value
                    // Allow empty input while typing
                    if (inputValue === '') {
                      setMinAge(18)
                      return
                    }
                    const value = parseInt(inputValue)
                    // If value is invalid or less than 18, set to 18
                    if (isNaN(value) || value < 18) {
                      setMinAge(18)
                    } else {
                      setMinAge(value)
                    }
                  }}
                  onKeyDown={(e) => {
                    // Prevent typing numbers less than 1 or 8
                    const key = e.key
                    const currentValue = (e.target as HTMLInputElement).value
                    const cursorPosition = (e.target as HTMLInputElement).selectionStart || 0
                    
                    // If trying to type a digit
                    if (key >= '0' && key <= '9') {
                      // If the input is empty or will result in a number starting with 0-7, prevent it
                      const newValue = currentValue.slice(0, cursorPosition) + key + currentValue.slice(cursorPosition)
                      const numValue = parseInt(newValue)
                      if (numValue < 18 && newValue.length >= 2) {
                        e.preventDefault()
                        setMinAge(18)
                      }
                    }
                  }}
                  onBlur={(e) => {
                    // Ensure value is at least 18 when field loses focus
                    const value = parseInt(e.target.value) || 18
                    if (value < 18) {
                      setMinAge(18)
                    }
                  }}
                  required
                />
                <p className="form-hint">Minimum age must be 18 or older</p>
              </div>

              <div className="form-group">
                <label className="form-label">Preferred Genders</label>
                <div className="interests-grid" style={{ maxHeight: '200px' }}>
                  {GENDER_OPTIONS.map(gender => (
                    <label key={gender} className="interest-checkbox">
                      <input
                        type="checkbox"
                        checked={preferredGenders.includes(gender)}
                        onChange={() => {
                          if (preferredGenders.includes(gender)) {
                            setPreferredGenders(preferredGenders.filter(g => g !== gender))
                          } else {
                            setPreferredGenders([...preferredGenders, gender])
                          }
                        }}
                      />
                      <span>{gender}</span>
                    </label>
                  ))}
                </div>
                <p className="form-hint">Select the genders you're interested in matching with</p>
              </div>

              <div className="form-group">
                <label htmlFor="maxDistance" className="form-label">Maximum Distance (miles)</label>
                <input
                  type="number"
                  id="maxDistance"
                  className="form-input"
                  min="1"
                  max="500"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(parseInt(e.target.value) || 50)}
                  required
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="profile-section">
              <h2 className="profile-section-title">🌱 Your Lifestyle</h2>
              <p className="profile-section-description">
                Help us match you better by sharing your lifestyle preferences
              </p>

              <div className="form-group">
                <label htmlFor="smoking" className="form-label">Smoking *</label>
                <select
                  id="smoking"
                  className="form-input"
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Non-smoker">Non-smoker</option>
                  <option value="Smokes Cigarettes">Smokes Cigarettes</option>
                  <option value="Uses Marijuana">Uses Marijuana</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="drinking" className="form-label">Drinking *</label>
                <select
                  id="drinking"
                  className="form-input"
                  value={drinking}
                  onChange={(e) => setDrinking(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Non-drinker">Non-drinker</option>
                  <option value="Occasionally">Occasionally</option>
                  <option value="Social drinker">Social drinker</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="children" className="form-label">Children *</label>
                <select
                  id="children"
                  className="form-input"
                  value={children}
                  onChange={(e) => setChildren(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Wants children">Wants children</option>
                  <option value="Doesn't want children">Doesn't want children</option>
                  <option value="Has children">Has children</option>
                  <option value="Open to children">Open to children</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="pets" className="form-label">Pets *</label>
                <select
                  id="pets"
                  className="form-input"
                  value={pets}
                  onChange={(e) => setPets(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Loves pets">Loves pets</option>
                  <option value="Has pets">Has pets</option>
                  <option value="Open to pets">Open to pets</option>
                  <option value="Allergic to pets">Allergic to pets</option>
                  <option value="Doesn't like pets">Doesn't like pets</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="religion" className="form-label">Religion/Spirituality *</label>
                <select
                  id="religion"
                  className="form-input"
                  value={religion}
                  onChange={(e) => setReligion(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Religious">Religious</option>
                  <option value="Spiritual">Spiritual</option>
                  <option value="Not religious">Not religious</option>
                  <option value="Agnostic">Agnostic</option>
                  <option value="Atheist">Atheist</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="workLifeBalance" className="form-label">Work-Life Balance *</label>
                <select
                  id="workLifeBalance"
                  className="form-input"
                  value={workLifeBalance}
                  onChange={(e) => setWorkLifeBalance(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="Workaholic">Workaholic</option>
                  <option value="Balanced">Balanced</option>
                  <option value="Prioritizes leisure">Prioritizes leisure</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="worksOut" className="form-label">Works out *</label>
                <select
                  id="worksOut"
                  className="form-input"
                  value={worksOut}
                  onChange={(e) => setWorksOut(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  <option value="All the time">All the time</option>
                  <option value="Frequently">Frequently</option>
                  <option value="Sometimes">Sometimes</option>
                  <option value="Never">Never</option>
                </select>
              </div>
            </div>
          )}

          <div className="profile-actions">
            {step > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={handleBack}>
                Back
              </button>
            ) : (
              <div />
            )}
            
            {step < 5 ? (
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleNext}
                disabled={step === 1 && (!displayName?.trim() || !age?.trim() || !gender?.trim())}
              >
                Continue
              </button>
            ) : (
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleSubmit}
                disabled={loading || interests.length < 3 || qualities.length < 3 || !smoking || !drinking || !children || !pets || !religion || !workLifeBalance}
              >
                {loading ? 'Creating Profile...' : 'Complete Profile'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

