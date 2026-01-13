import { useState, FormEvent, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'

export default function PhoneLogin() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'verify'>('phone')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  const [shake, setShake] = useState(false)
  const [searchParams] = useSearchParams()

  // Check for referral code in URL
  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      setReferralCode(refCode.toUpperCase())
    }
  }, [searchParams])

  // Create floating particles
  const [particles] = useState(() => {
    const particles = []
    for (let i = 0; i < 20; i++) {
      particles.push({
        id: i,
        size: Math.random() * 4 + 2,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 5
      })
    }
    return particles
  })

  const formatPhoneInput = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '')
    
    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
    }
  }

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<{ message: string; phoneNumber: string; code?: string; smsSent: boolean }>('/sms/send-code', {
        phoneNumber
      })

      // Always show the code if it's returned (helps with debugging and if SMS fails)
      if (response.code) {
        console.log('🔐 Verification code:', response.code)
        // Show it in an alert for easy access
        alert(`Your verification code is: ${response.code}\n\n(Enter this code to continue)`)
      }

      // Check if SMS was actually sent
      if (response.smsSent === false) {
        console.warn('⚠️ SMS was not sent, but code is available')
        // Show a helpful message
        setError('SMS delivery may have failed. Check the alert above for your verification code.')
      }

      setStep('verify')
      setLoading(false) // Reset loading when switching to verify step
    } catch (err: any) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to send verification code'
      setError(errorMsg)
      setLoading(false)
      console.error('Send code error:', err)
    }
  }

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<{ 
        message: string
        token: string
        userId: string
        hasProfile: boolean
        isNewUser: boolean
        referralCode?: string
      }>('/sms/verify-code', {
        phoneNumber,
        code,
        referralCode: referralCode || undefined,
        acceptTerms: true, // User must accept to proceed
        acceptPrivacy: true
      })

      // Store token
      localStorage.setItem('token', response.token)
      
      // Refresh the page to trigger AuthContext to fetch user data
      // This is simpler than trying to manually call fetchUser
      window.location.href = response.hasProfile ? '/browse' : '/create-profile'
    } catch (err: any) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
      setError(err?.message || 'Invalid verification code')
      setLoading(false)
    }
  }

  if (step === 'phone') {
    return (
      <div className="auth-page-enhanced">
        {/* Animated background gradient */}
        <div className="auth-bg-gradient"></div>
        
        {/* Floating particles */}
        <div className="auth-particles">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="auth-particle"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDuration: `${particle.duration}s`,
                animationDelay: `${particle.delay}s`
              }}
            />
          ))}
        </div>

        {/* Glowing orbs */}
        <div className="auth-orb auth-orb-1"></div>
        <div className="auth-orb auth-orb-2"></div>
        <div className="auth-orb auth-orb-3"></div>

        <div className="auth-container-enhanced">
          <div className="auth-header-enhanced">
            <Link to="/" className="auth-logo-enhanced">
              <span className="auth-logo-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="heartGradientPhone" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                    </linearGradient>
                    <filter id="glowPhone">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <g className="logo-rotate-group">
                    <path 
                      d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                      fill="url(#heartGradientPhone)"
                      className="logo-heart"
                      filter="url(#glowPhone)"
                    />
                    <g className="logo-arrow-top">
                      <circle cx="36" cy="10" r="3" fill="currentColor" opacity="0.9" />
                      <path d="M30 10L36 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="logo-arrow" />
                      <path d="M33 7L36 10L33 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="logo-arrow" />
                    </g>
                    <g className="logo-arrow-bottom">
                      <circle cx="12" cy="38" r="3" fill="currentColor" opacity="0.9" />
                      <path d="M18 38L12 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="logo-arrow" />
                      <path d="M15 35L12 38L15 41" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="logo-arrow" />
                    </g>
                    <circle cx="24" cy="8" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                    <circle cx="40" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                    <circle cx="24" cy="40" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                    <circle cx="8" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  </g>
                </svg>
              </span>
              <span className="auth-logo-text">Mulligan</span>
            </Link>
            <h1 className="auth-title-enhanced">Welcome to Mulligan</h1>
            <p className="auth-subtitle-enhanced">Enter your phone number to get started</p>
          </div>

          <div className={`auth-card-enhanced ${shake ? 'shake' : ''}`}>
            {error && <div className="auth-error-enhanced">{error}</div>}
            
            <form className="auth-form-enhanced" onSubmit={handlePhoneSubmit}>
              <div className="form-group-enhanced">
                <label htmlFor="phone" className="form-label-enhanced">Phone Number</label>
                <div className="form-input-wrapper">
                  <span className="form-icon">📱</span>
                  <input
                    type="tel"
                    id="phone"
                    className="form-input-enhanced"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => {
                      const formatted = formatPhoneInput(e.target.value)
                      setPhoneNumber(formatted)
                    }}
                    maxLength={14}
                    required
                  />
                </div>
              </div>

              {referralCode && (
                <div className="form-group-enhanced">
                  <label htmlFor="referral" className="form-label-enhanced">Referral Code (Optional)</label>
                  <div className="form-input-wrapper">
                    <span className="form-icon">🎁</span>
                    <input
                      type="text"
                      id="referral"
                      className="form-input-enhanced"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="REF123"
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn-enhanced btn-primary-enhanced" 
                disabled={loading || phoneNumber.length < 10}
              >
                {loading ? (
                  <>
                    <span className="btn-spinner"></span>
                    Sending...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </button>
            </form>

            <p className="auth-footer-enhanced">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="auth-link-enhanced">Terms of Service</Link> and{' '}
              <Link to="/privacy" className="auth-link-enhanced">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page-enhanced">
      {/* Animated background gradient */}
      <div className="auth-bg-gradient"></div>
      
      {/* Floating particles */}
      <div className="auth-particles">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="auth-particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`
            }}
          />
        ))}
      </div>

      {/* Glowing orbs */}
      <div className="auth-orb auth-orb-1"></div>
      <div className="auth-orb auth-orb-2"></div>
      <div className="auth-orb auth-orb-3"></div>

      <div className="auth-container-enhanced">
        <div className="auth-header-enhanced">
          <Link to="/" className="auth-logo-enhanced">
            <span className="auth-logo-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="heartGradientVerify" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                  </linearGradient>
                  <filter id="glowVerify">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <g className="logo-rotate-group">
                  <path 
                    d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                    fill="url(#heartGradientVerify)"
                    className="logo-heart"
                    filter="url(#glowVerify)"
                  />
                  <g className="logo-arrow-top">
                    <circle cx="36" cy="10" r="3" fill="currentColor" opacity="0.9" />
                    <path d="M30 10L36 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="logo-arrow" />
                    <path d="M33 7L36 10L33 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="logo-arrow" />
                  </g>
                  <g className="logo-arrow-bottom">
                    <circle cx="12" cy="38" r="3" fill="currentColor" opacity="0.9" />
                    <path d="M18 38L12 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="logo-arrow" />
                    <path d="M15 35L12 38L15 41" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="logo-arrow" />
                  </g>
                  <circle cx="24" cy="8" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="40" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="24" cy="40" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="8" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                </g>
              </svg>
            </span>
            <span className="auth-logo-text">Mulligan</span>
          </Link>
          <h1 className="auth-title-enhanced">Verify Your Phone</h1>
          <p className="auth-subtitle-enhanced">
            We sent a 6-digit code to {phoneNumber}
          </p>
        </div>

        <div className={`auth-card-enhanced ${shake ? 'shake' : ''}`}>
          {error && <div className="auth-error-enhanced">{error}</div>}

          <form className="auth-form-enhanced" onSubmit={handleVerifySubmit}>
            <div className="form-group-enhanced">
              <label htmlFor="code" className="form-label-enhanced">Verification Code</label>
              <div className="form-input-wrapper">
                <span className="form-icon">🔐</span>
                <input
                  type="text"
                  id="code"
                  className="form-input-enhanced"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setCode(digits)
                    // Don't auto-submit - let user click the button
                  }}
                  onKeyDown={(e) => {
                    // Prevent Enter key from submitting until user explicitly clicks
                    if (e.key === 'Enter' && code.length !== 6) {
                      e.preventDefault()
                    }
                  }}
                  maxLength={6}
                  required
                  autoFocus
                  style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.5rem', fontWeight: '600' }}
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-enhanced btn-primary-enhanced" 
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <>
                  <span className="btn-spinner"></span>
                  Verifying...
                </>
              ) : (
                'Verify & Continue'
              )}
            </button>

            <button
              type="button"
              className="btn-enhanced"
              style={{
                background: 'transparent',
                color: 'var(--color-rose-600)',
                border: '2px solid var(--color-rose-300)',
                marginTop: 'var(--space-4)'
              }}
              onClick={() => {
                setStep('phone')
                setCode('')
                setError('')
              }}
              disabled={loading}
            >
              Change Phone Number
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

