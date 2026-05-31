import { useState, FormEvent, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import LandingAddToHomePrompt from '../components/LandingAddToHomePrompt'
import { isAgeGateAccepted } from '../lib/ageGate'
import LoginSupportNote from '../components/LoginSupportNote'

export default function PhoneLogin() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'verify'>('phone')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [submittedPhone, setSubmittedPhone] = useState('')
  const [shake, setShake] = useState(false)
  const navigate = useNavigate()
  const { phoneLogin } = useAuth()

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

  const goToVerifyStep = useCallback(() => {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Enter your phone number first.')
      return
    }
    setSubmittedPhone(phoneNumber)
    setStep('verify')
    setError('')
    setCode('')
  }, [phoneNumber])

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const attemptSend = async () => {
      const response = await api.post<{ message: string; phoneNumber: string; code?: string; smsSent: boolean }>(
        '/sms/send-code',
        { phoneNumber },
      )

      if (response.code) {
        console.log('🔐 Verification code:', response.code)
        alert(`Your verification code is: ${response.code}\n\n(Enter this code to continue)`)
      }

      if (response.smsSent === false) {
        setError('SMS delivery may have failed. Check the alert above for your verification code.')
      }

      setSubmittedPhone(response.phoneNumber || phoneNumber)
      setStep('verify')
      setLoading(false)
    }

    try {
      await attemptSend()
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0
      const isNetworkFailure = status === 0

      if (isNetworkFailure) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          await attemptSend()
          return
        } catch (retryErr: unknown) {
          if (retryErr instanceof ApiError) {
            err = retryErr
          }
        }
      }

      setShake(true)
      setTimeout(() => setShake(false), 600)
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to send verification code'
      const finalStatus = err instanceof ApiError ? err.status : 0
      if (finalStatus === 429) {
        setError('Too many attempts. Please wait a minute and try again.')
      } else if (finalStatus === 0) {
        setSubmittedPhone(phoneNumber)
        setStep('verify')
        setError(
          'We could not confirm the code was sent. If you received a text, enter the 6-digit code below.',
        )
      } else {
        setError(errorMsg)
      }
      setLoading(false)
      console.error('Send code error:', err)
    }
  }

  const handleResendCode = useCallback(async () => {
    const phone = submittedPhone || phoneNumber
    if (!phone) return
    setError('')
    setResendLoading(true)
    try {
      const response = await api.post<{ message: string; phoneNumber: string; code?: string; smsSent: boolean }>(
        '/sms/send-code',
        { phoneNumber: phone }
      )
      if (response.code) {
        alert(`Your verification code is: ${response.code}\n\n(Enter this code to continue)`)
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to resend verification code'
      setError(errorMsg)
    } finally {
      setResendLoading(false)
    }
  }, [submittedPhone, phoneNumber])

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Use phoneLogin from AuthContext which handles token storage and user fetching
      const { connectSetupComplete: ready } = await phoneLogin(submittedPhone || phoneNumber, code)

      if (!isAgeGateAccepted()) {
        navigate('/age-gate', { replace: true })
      } else {
        navigate(ready ? '/browse' : '/create-profile', { replace: true })
      }
    } catch (err: any) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
      setError(err?.message || 'Invalid verification code')
      setLoading(false)
    }
  }

  if (step === 'phone') {
    return (
      <div className="auth-page-enhanced native-app-screen">
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
          <LandingAddToHomePrompt variant="featured" />

          <div className="auth-header-enhanced">
            <Link to="/" className="auth-logo-enhanced">
              <span className="auth-logo-icon">
                <BrandMark size={48} alt="" />
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
                  <span className="form-icon form-icon--phone" aria-hidden="true">📱</span>
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

              <button
                type="button"
                className="btn-enhanced"
                style={{
                  background: 'transparent',
                  color: 'var(--color-rose-600)',
                  border: '2px solid var(--color-rose-300)',
                  marginTop: 'var(--space-3)',
                }}
                onClick={goToVerifyStep}
                disabled={loading || phoneNumber.length < 10}
              >
                I already have a code
              </button>
            </form>

            <p className="auth-footer-enhanced">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="auth-link-enhanced">Terms of Service</Link> and{' '}
              <Link to="/privacy" className="auth-link-enhanced">Privacy Policy</Link>
            </p>
            <LoginSupportNote phoneNumber={phoneNumber || submittedPhone} step="phone" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page-enhanced native-app-screen">
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
        <LandingAddToHomePrompt variant="featured" />

        <div className="auth-header-enhanced">
          <Link to="/" className="auth-logo-enhanced">
            <span className="auth-logo-icon">
              <BrandMark size={48} alt="" />
            </span>
            <span className="auth-logo-text">Mulligan</span>
          </Link>
          <h1 className="auth-title-enhanced">Verify Your Phone</h1>
          <p className="auth-subtitle-enhanced">
            We sent a 6-digit code to {submittedPhone || phoneNumber}
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
              onClick={() => void handleResendCode()}
              disabled={loading || resendLoading}
            >
              {resendLoading ? 'Sending…' : 'Resend code'}
            </button>

            <button
              type="button"
              className="btn-enhanced"
              style={{
                background: 'transparent',
                color: 'var(--color-rose-600)',
                border: '2px solid var(--color-rose-300)',
                marginTop: 'var(--space-3)'
              }}
              onClick={() => {
                setStep('phone')
                setCode('')
                setError('')
                setSubmittedPhone('')
              }}
              disabled={loading || resendLoading}
            >
              Change Phone Number
            </button>
          </form>

          <LoginSupportNote phoneNumber={submittedPhone || phoneNumber} step="verify" />
        </div>
      </div>
    </div>
  )
}

