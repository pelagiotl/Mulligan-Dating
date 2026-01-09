import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [referrerName, setReferrerName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validatingCode, setValidatingCode] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Check for referral code in URL
  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      setReferralCode(refCode.toUpperCase())
      validateReferralCode(refCode)
    }
  }, [searchParams])

  const validateReferralCode = async (code: string) => {
    if (!code) return
    setValidatingCode(true)
    try {
      const data = await api.get<{ valid: boolean; referrerName?: string }>(`/referrals/validate/${code}`)
      if (data.valid) {
        setReferrerName(data.referrerName || null)
      } else {
        setReferrerName(null)
      }
    } catch {
      setReferrerName(null)
    } finally {
      setValidatingCode(false)
    }
  }

  const handleReferralCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase().trim()
    setReferralCode(code)
    if (code.length >= 4) {
      validateReferralCode(code)
    } else {
      setReferrerName(null)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      await signup(email, password, referralCode || undefined)
      navigate('/create-profile')
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link to="/" className="auth-logo">💘 Mulligan</Link>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Start your journey to finding love</p>
        </div>

        <div className="auth-card">
          {error && <div className="auth-error">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                type="email"
                id="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                type="password"
                id="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
                minLength={8}
              />
              <p className="form-hint">Must be at least 8 characters</p>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="referralCode" className="form-label">
                Referral Code <span className="form-label-optional">(Optional)</span>
              </label>
              <input
                type="text"
                id="referralCode"
                className="form-input"
                value={referralCode}
                onChange={handleReferralCodeChange}
                placeholder="ABC123"
                maxLength={8}
                style={{ textTransform: 'uppercase' }}
              />
              {validatingCode && (
                <p className="form-hint">Validating code...</p>
              )}
              {referrerName && !validatingCode && (
                <p className="form-hint" style={{ color: 'var(--color-rose-600)' }}>
                  ✓ Referred by {referrerName}
                </p>
              )}
              {referralCode && !referrerName && !validatingCode && referralCode.length >= 4 && (
                <p className="form-hint" style={{ color: 'var(--text-muted)' }}>
                  Invalid referral code
                </p>
              )}
              <p className="form-hint">
                Have a friend's referral code? Enter it here and they'll get a free mulligan!
              </p>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
