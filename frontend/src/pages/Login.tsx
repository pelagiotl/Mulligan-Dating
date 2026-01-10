import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)
  const [shake, setShake] = useState(false)
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  // Reset error state when component mounts
  useEffect(() => {
    console.log('Login page mounted, isAuthenticated:', isAuthenticated)
    setError('')
    setLoading(false)
    
    // Only redirect if we have BOTH a token AND authenticated state
    // Add a delay to ensure state has fully updated after logout
    const checkAuth = () => {
      const hasToken = localStorage.getItem('token')
      const shouldRedirect = isAuthenticated && hasToken
      
      console.log('Auth check:', { hasToken: !!hasToken, isAuthenticated, shouldRedirect })
      
      if (shouldRedirect) {
        // Double-check token still exists before redirecting
        const tokenCheck = localStorage.getItem('token')
        if (tokenCheck) {
          console.log('User already authenticated, redirecting to browse')
          navigate('/browse')
        }
      }
    }
    
    // Delay the check to ensure logout state has fully cleared
    const timer = setTimeout(checkAuth, 100)
    return () => clearTimeout(timer)
  }, [isAuthenticated, navigate])

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
    setSuccess(false)
    setShake(false)
    setLoading(true)

    try {
      console.log('Login form submitted for:', email)
      console.log('Current auth state before login:', { isAuthenticated })
      
      // Clear any potential stale state before login
      // Wait a moment to ensure any previous logout state has cleared
      await new Promise(resolve => setTimeout(resolve, 50))
      
      console.log('Calling login function...')
      const { hasProfile } = await login(email, password)
      console.log('Login successful, hasProfile:', hasProfile)
      
      // Verify we're actually authenticated now
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Show success animation
      setSuccess(true)
      setLoading(false)
      
      // Wait for success animation to play, then navigate
      await new Promise(resolve => setTimeout(resolve, 800))
      navigate(hasProfile ? '/browse' : '/create-profile')
    } catch (err: any) {
      console.error('Login error details:', {
        error: err,
        message: err?.message,
        status: err?.status,
        name: err?.name,
        stack: err?.stack
      })
      
      // Trigger shake animation
      setShake(true)
      setTimeout(() => setShake(false), 600)
      
      // Show more specific error messages
      let errorMessage = 'Invalid email or password'
      if (err?.message) {
        const msg = err.message.toLowerCase()
        if (msg.includes('starting up') || msg.includes('cold start')) {
          errorMessage = 'Server is waking up. Please wait 10-15 seconds and try again.'
        } else if (msg.includes('timeout') || msg.includes('unavailable')) {
          errorMessage = 'Server is starting up. Please wait a moment and try again.'
        } else if (msg.includes('failed to fetch') || msg.includes('network error') || msg.includes('load failed') || msg.includes('connection failed')) {
          errorMessage = 'Server is starting up. Please wait 10-15 seconds and try again.'
        } else if (msg.includes('no token') || msg.includes('authentication')) {
          errorMessage = 'Authentication failed. Please try again.'
        } else if (msg.includes('invalid response') || msg.includes('invalid')) {
          errorMessage = 'Server error. Please try again in a moment.'
        } else {
          // Show the actual error message if it's meaningful
          errorMessage = err.message.length > 100 ? 'An error occurred. Please try again.' : err.message
        }
      } else if (err?.status) {
        if (err.status === 401 || err.status === 403) {
          errorMessage = 'Invalid email or password'
        } else if (err.status === 500) {
          errorMessage = 'Server error. Please try again.'
        } else if (err.status === 408) {
          errorMessage = 'Server is starting up. Please wait 10-15 seconds and try again.'
        }
      }
      
      console.log('Setting error message:', errorMessage)
      setError(errorMessage)
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
                <defs>
                  {/* Gradient for heart */}
                  <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                  </linearGradient>
                  {/* Glow filter */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                
                {/* Rotating group with arrows */}
                <g className="logo-rotate-group">
                  {/* Heart shape with gradient */}
                  <path 
                    d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                    fill="url(#heartGradient)"
                    className="logo-heart"
                    filter="url(#glow)"
                  />
                  
                  {/* Top right arrow - more prominent */}
                  <g className="logo-arrow-top">
                    <circle cx="36" cy="10" r="3" fill="currentColor" opacity="0.9" />
                    <path 
                      d="M30 10L36 10" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                      className="logo-arrow"
                    />
                    <path 
                      d="M33 7L36 10L33 13" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      fill="none"
                      className="logo-arrow"
                    />
                  </g>
                  
                  {/* Bottom left arrow - more prominent */}
                  <g className="logo-arrow-bottom">
                    <circle cx="12" cy="38" r="3" fill="currentColor" opacity="0.9" />
                    <path 
                      d="M18 38L12 38" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                      className="logo-arrow"
                    />
                    <path 
                      d="M15 35L12 38L15 41" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      fill="none"
                      className="logo-arrow"
                    />
                  </g>
                  
                  {/* Sparkle effects */}
                  <circle cx="24" cy="8" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="40" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="24" cy="40" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                  <circle cx="8" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                </g>
              </svg>
            </span>
            <span className="auth-logo-text">Mulligan</span>
          </Link>
          <h1 className="auth-title-enhanced">Welcome back</h1>
          <p className="auth-subtitle-enhanced">Sign in to continue your journey</p>
        </div>

        <div className={`auth-card-enhanced ${shake ? 'shake' : ''} ${success ? 'success' : ''}`}>
          {error && <div className="auth-error-enhanced">{error}</div>}
          {success && (
            <div className="auth-success-enhanced">
              <svg className="success-checkmark" viewBox="0 0 52 52">
                <circle className="success-checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="success-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
              <span>Login successful!</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="auth-form-enhanced">
            <div className="form-group-enhanced">
              <label htmlFor="email" className="form-label-enhanced">Email</label>
              <div className="form-input-wrapper">
                <input
                  type="email"
                  id="email"
                  className={`form-input-enhanced ${shake ? 'input-shake' : ''}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={loading || success}
                />
                <span className="form-input-glow"></span>
              </div>
            </div>

            <div className="form-group-enhanced">
              <label htmlFor="password" className="form-label-enhanced">Password</label>
              <div className="form-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  className={`form-input-enhanced ${shake ? 'input-shake' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  disabled={loading || success}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={loading || success}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
                <span className="form-input-glow"></span>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-enhanced btn-primary-enhanced"
              disabled={loading || success}
            >
              {loading ? (
                <>
                  <span className="btn-spinner"></span>
                  <span className="btn-text">Signing in...</span>
                </>
              ) : success ? (
                <>
                  <span className="btn-text">Success!</span>
                </>
              ) : (
                <>
                  <span className="btn-text">Sign in</span>
                  <span className="btn-shine"></span>
                </>
              )}
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
