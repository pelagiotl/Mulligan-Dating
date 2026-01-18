import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import MaintenanceBanner from './MaintenanceBanner'

export default function Layout() {
  // Always call hooks at the top level, before any conditional logic
  // This ensures hooks are called in the same order on every render
  const { logout, isAdmin, isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tokenCount, setTokenCount] = useState<number | null>(null)

  const isActive = (path: string) => location.pathname === path

  // Fetch token count when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchTokenCount()
    } else {
      setTokenCount(null)
    }
  }, [isAuthenticated])

  const fetchTokenCount = async () => {
    try {
      const data = await api.get<{ availableTokens: number }>("/tokens")
      setTokenCount(data.availableTokens)
    } catch (err) {
      // Silently fail - token count is not critical for navbar
      console.error('Failed to fetch token count:', err)
    }
  }

  return (
    <div className="app-layout">
      <MaintenanceBanner />
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/browse" className="navbar-logo">
            <span className="navbar-logo-icon">
              <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="navbarHeartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                  </linearGradient>
                  <filter id="navbarGlow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <path
                  d="M24 36C24 36 12 26 12 18C12 13 16 10 20 10C22 10 24 11 24 13C24 11 26 10 28 10C32 10 36 13 36 18C36 26 24 36 24 36Z"
                  fill="url(#navbarHeartGradient)"
                  className="logo-heart"
                  filter="url(#navbarGlow)"
                />
                <g className="logo-arrow-top">
                  <circle cx="36" cy="10" r="2" fill="currentColor" opacity="0.9" />
                  <path d="M30 10L36 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="logo-arrow" />
                  <path d="M33 7L36 10L33 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-arrow" />
                </g>
                <g className="logo-arrow-bottom">
                  <circle cx="12" cy="38" r="2" fill="currentColor" opacity="0.9" />
                  <path d="M18 38L12 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="logo-arrow" />
                  <path d="M15 35L12 38L15 41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="logo-arrow" />
                </g>
                <circle cx="24" cy="8" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                <circle cx="40" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                <circle cx="8" cy="24" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
                <circle cx="24" cy="40" r="1.5" fill="currentColor" opacity="0.8" className="logo-sparkle" />
              </svg>
            </span>
            <span className="navbar-logo-text">Mulligan</span>
          </Link>
          
          {/* Token Count Badge */}
          {isAuthenticated && tokenCount !== null && (
            <Link 
              to="/settings" 
              className="navbar-token-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--color-rose-600)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <span>🎟️</span>
              <span>{tokenCount}</span>
            </Link>
          )}
          
          <ul className="navbar-nav">
            <li>
              <Link 
                to="/browse" 
                className={`navbar-link ${isActive('/browse') ? 'active' : ''}`}
              >
                <span>💫</span> Find Your Match
              </Link>
            </li>
            <li>
              <Link 
                to="/matches" 
                className={`navbar-link ${isActive('/matches') ? 'active' : ''}`}
              >
                <span>💌</span> Matches
              </Link>
            </li>
            <li>
              <Link 
                to="/profile" 
                className={`navbar-link ${isActive('/profile') ? 'active' : ''}`}
              >
                <span>👤</span> My Profile
              </Link>
            </li>
            <li>
              <Link 
                to="/referrals" 
                className={`navbar-link ${isActive('/referrals') ? 'active' : ''}`}
              >
                <span>🎁</span> Referrals
              </Link>
            </li>
            <li>
              <Link 
                to="/settings" 
                className={`navbar-link ${isActive('/settings') ? 'active' : ''}`}
              >
                <span>⚙️</span> Settings
              </Link>
            </li>
            {isAdmin && (
              <li>
                <Link 
                  to="/admin" 
                  className={`navbar-link ${isActive('/admin') ? 'active' : ''}`}
                >
                  <span>🔐</span> Admin
                </Link>
              </li>
            )}
            <li>
              <button 
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="navbar-link logout"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Log out
              </button>
            </li>
          </ul>
        </div>
      </nav>
      
      <main className="main-content">
        <Outlet />
      </main>
      
      <footer style={{
        padding: 'var(--space-6) var(--space-8)',
        textAlign: 'center',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        marginTop: 'auto'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'center',
          gap: 'var(--space-6)',
          flexWrap: 'wrap',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)'
        }}>
          <Link to="/terms" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Terms of Service
          </Link>
          <span>•</span>
          <Link to="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Privacy Policy
          </Link>
          <span>•</span>
          <span>© {new Date().getFullYear()} Mulligan Dating</span>
        </div>
      </footer>
    </div>
  )
}

