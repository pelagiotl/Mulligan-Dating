import { useState, useEffect, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Other', 'Prefer not to say']
const LOOKING_FOR_OPTIONS = ['Relationship', 'Something casual', 'Friendship', 'Not sure yet']

const INTEREST_OPTIONS = [
  'Travel', 'Music', 'Sports', 'Cooking', 'Reading', 'Movies', 'Fitness', 'Art',
  'Photography', 'Dancing', 'Gaming', 'Hiking', 'Yoga', 'Writing', 'Technology',
  'Fashion', 'Animals', 'Volunteering', 'Food', 'Coffee', 'Nightlife', 'Comedy',
  'Concerts', 'Beach', 'Camping', 'Cycling', 'Running', 'Swimming', 'Tennis',
  'Board Games', 'Video Games', 'Crafts', 'Painting', 'Singing', 
  'Playing Instruments', 'Podcasts', 'Meditation', 'History', 'Science',
  'Business', 'Education'
]

const DEALBREAKER_OPTIONS = [
  'Smokes cigarettes', 'Marijuana', 'Frequent drinking', 'Drinks alcohol', 'Drug use', 
  'Doesn\'t want children', 'Wants children',
  'Poor communication', 'No ambition',
  'Bad hygiene', 'Workaholic', 
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

  // Step 2: Interests
  const [interests, setInterests] = useState<string[]>([])

  // Step 3: Dealbreakers & Partner Qualities
  const [dealbreakers, setDealbreakers] = useState<string[]>([])
  const [qualities, setQualities] = useState<string[]>([])

  // Step 4: Dating Preferences
  const [minAge, setMinAge] = useState(18)
  const [maxAge, setMaxAge] = useState(50)
  const [preferredGenders, setPreferredGenders] = useState<string[]>([])
  const [maxDistance, setMaxDistance] = useState(50)

  // Step 5: Lifestyle
  const [smoking, setSmoking] = useState('')
  const [drinking, setDrinking] = useState('')
  const [children, setChildren] = useState('')
  const [pets, setPets] = useState('')
  const [religion, setReligion] = useState('')
  const [workLifeBalance, setWorkLifeBalance] = useState('')

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

  // @ts-ignore
  const _handleRemoveTag = (value: string, list: string[], setList: (l: string[]) => void) => {
    setList(list.filter(item => item !== value))
  }

  // @ts-ignore
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
    if (step === 5) {
      // Validate all lifestyle fields are filled
      if (!smoking || !drinking || !children || !pets || !religion || !workLifeBalance) {
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
            // Cap max age at 50 if it's higher
            setMaxAge(Math.min(data.preferences.max_age, 50))
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
          }
        }
      } catch (err) {
        // Profile doesn't exist yet, that's okay - user is creating new profile
        console.log('No existing profile found, creating new one')
      }
    }

    loadProfile()
  }, [])

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
    if (!smoking || !drinking || !children || !pets || !religion || !workLifeBalance) {
      setError('Please fill in all lifestyle fields before completing your profile')
      setLoading(false)
      return
    }

    try {
      // Create profile
      await api.post('/profile', {
        displayName,
        age: parseInt(age),
        gender,
        location,
        bio,
        lookingFor
      })

      // Add interests
      if (interests.length > 0) {
        await api.put('/profile/interests', {
          interests: interests.map(name => ({ name }))
        })
      }

      // Add dealbreakers
      if (dealbreakers.length > 0) {
        await api.put('/profile/dealbreakers', {
          dealbreakers: dealbreakers.map(description => ({ description }))
        })
      }

      // Add partner qualities
      if (qualities.length > 0) {
        await api.put('/profile/partner-qualities', {
          qualities: qualities.map(quality => ({ quality }))
        })
      }

          // Save dating preferences
      await api.put('/profile/preferences', {
        minAge,
        maxAge,
        preferredGenders: preferredGenders.length > 0 ? preferredGenders : null,
        maxDistance
      })

          // Save lifestyle (all fields are required)
      await api.put('/profile/lifestyle', {
        smoking,
        drinking,
        children,
        pets,
        religion,
        workLifeBalance
      })

      await refreshProfile()
      navigate('/browse')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
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
                  <label htmlFor="location" className="form-label">Location</label>
                  <input
                    type="text"
                    id="location"
                    className="form-input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, State"
                  />
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
                  onChange={(e) => setMinAge(parseInt(e.target.value) || 18)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="maxAge" className="form-label">Maximum Age</label>
                <input
                  type="number"
                  id="maxAge"
                  className="form-input"
                  min="18"
                  max="50"
                  value={maxAge > 50 ? 50 : maxAge}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 50
                    setMaxAge(Math.min(Math.max(value, 18), 50)) // Clamp between 18 and 50
                  }}
                  required
                />
                {maxAge > 50 && (
                  <p className="form-hint" style={{ color: 'var(--color-rose-600)' }}>
                    Maximum age is limited to 50
                  </p>
                )}
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

