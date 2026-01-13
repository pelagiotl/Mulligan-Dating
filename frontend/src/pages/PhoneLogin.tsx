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
  const [searchParams] = useSearchParams()

  // Check for referral code in URL
  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      setReferralCode(refCode.toUpperCase())
    }
  }, [searchParams])

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

      // In development, show the code
      if (response.code) {
        console.log('🔐 Verification code:', response.code)
      }

      setStep('verify')
    } catch (err: any) {
      setError(err?.message || 'Failed to send verification code')
    } finally {
      setLoading(false)
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
      setError(err?.message || 'Invalid verification code')
      setLoading(false)
    }
  }

  if (step === 'phone') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Welcome to Mulligan</h1>
          <p className="auth-subtitle">Enter your phone number to get started</p>

          <form onSubmit={handlePhoneSubmit}>
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                className="form-input"
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

            {referralCode && (
              <div className="form-group">
                <label htmlFor="referral">Referral Code</label>
                <input
                  type="text"
                  id="referral"
                  className="form-input"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="REF123"
                />
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading || phoneNumber.length < 10}>
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>

          <p className="auth-footer">
            By continuing, you agree to our{' '}
            <Link to="/terms">Terms of Service</Link> and{' '}
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Verify Your Phone</h1>
        <p className="auth-subtitle">
          We sent a 6-digit code to {phoneNumber}
        </p>

        <form onSubmit={handleVerifySubmit}>
          <div className="form-group">
            <label htmlFor="code">Verification Code</label>
            <input
              type="text"
              id="code"
              className="form-input"
              placeholder="123456"
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(digits)
              }}
              maxLength={6}
              required
              autoFocus
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>

          <button
            type="button"
            className="btn-secondary"
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
  )
}

