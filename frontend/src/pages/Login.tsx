import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { hasProfile } = await login(email, password)
      navigate(hasProfile ? '/browse' : '/create-profile')
    } catch (err: any) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
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
                {/* Circular path for rotation */}
                <g className="logo-rotate-group">
                  {/* Heart shape - main element */}
                  <path 
                    d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                    fill="currentColor"
                    className="logo-heart"
                  />
                  {/* Circular arrow - top right */}
                  <path 
                    d="M30 10C32 10 34 11 35.5 12.5" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    fill="none"
                    className="logo-arrow"
                  />
                  <path 
                    d="M35.5 12.5L32 9" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="logo-arrow"
                  />
                  {/* Circular arrow - bottom left */}
                  <path 
                    d="M18 38C16 38 14 37 12.5 35.5" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    fill="none"
                    className="logo-arrow"
                  />
                  <path 
                    d="M12.5 35.5L16 39" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="logo-arrow"
                  />
                </g>
              </svg>
            </span>
            <span className="auth-logo-text">Mulligan</span>
          </Link>
          <h1 className="auth-title-enhanced">Welcome back</h1>
          <p className="auth-subtitle-enhanced">Sign in to continue your journey</p>
        </div>

        <div className="auth-card-enhanced">
          {error && <div className="auth-error-enhanced">{error}</div>}
          
          <form onSubmit={handleSubmit} className="auth-form-enhanced">
            <div className="form-group-enhanced">
              <label htmlFor="email" className="form-label-enhanced">Email</label>
              <div className="form-input-wrapper">
                <input
                  type="email"
                  id="email"
                  className="form-input-enhanced"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
                <span className="form-input-glow"></span>
              </div>
            </div>

            <div className="form-group-enhanced">
              <label htmlFor="password" className="form-label-enhanced">Password</label>
              <div className="form-input-wrapper">
                <input
                  type="password"
                  id="password"
                  className="form-input-enhanced"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <span className="form-input-glow"></span>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-enhanced btn-primary-enhanced"
              disabled={loading}
            >
              <span className="btn-text">{loading ? 'Signing in...' : 'Sign in'}</span>
              <span className="btn-shine"></span>
            </button>
          </form>
        </div>

        <div className="auth-footer-enhanced">
          Don't have an account?{' '}
          <Link to="/signup" className="auth-link-enhanced">Create one</Link>
        </div>
      </div>
    </div>
  )
}
