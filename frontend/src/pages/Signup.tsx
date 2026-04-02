import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import BrandMark from '../components/BrandMark'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()

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

    if (!acceptTerms) {
      setError('You must accept the Terms of Service')
      return
    }

    if (!acceptPrivacy) {
      setError('You must accept the Privacy Policy')
      return
    }

    setLoading(true)

    try {
      await signup(email, password, acceptTerms, acceptPrivacy)
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
          <Link to="/" className="auth-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <BrandMark size={36} alt="" />
            Mulligan
          </Link>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Meet people nearby who share your interests</p>
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
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                  style={{ marginTop: '4px', cursor: 'pointer' }}
                />
                <label htmlFor="acceptTerms" style={{ cursor: 'pointer', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" style={{ color: 'var(--color-rose-600)', textDecoration: 'underline' }}>
                    Terms of Service
                  </Link>
                </label>
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <input
                  type="checkbox"
                  id="acceptPrivacy"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                  required
                  style={{ marginTop: '4px', cursor: 'pointer' }}
                />
                <label htmlFor="acceptPrivacy" style={{ cursor: 'pointer', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  I agree to the{' '}
                  <Link to="/privacy" target="_blank" style={{ color: 'var(--color-rose-600)', textDecoration: 'underline' }}>
                    Privacy Policy
                  </Link>
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full"
              disabled={loading || !acceptTerms || !acceptPrivacy}
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
