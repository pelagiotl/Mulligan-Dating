import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import MaintenanceBanner from './MaintenanceBanner'
import BrandMark from './BrandMark'

export default function Layout() {
  // Always call hooks at the top level, before any conditional logic
  // This ensures hooks are called in the same order on every render
  const { logout, isAdmin, isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tokenCount, setTokenCount] = useState<number | null>(null)

  const isActive = (path: string) => location.pathname === path
  /** Match native MainTabs: hide top links + show bottom bar on phone (not during profile wizard). */
  const nativeMobileShell =
    isAuthenticated && location.pathname !== '/create-profile'

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
    <div
      className={`app-layout${nativeMobileShell ? ' app-layout--native-mobile-shell' : ''}`}
    >
      <MaintenanceBanner />
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/browse" className="navbar-logo">
            <span className="navbar-logo-icon">
              <BrandMark size={32} alt="" />
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
                gap: '0.4rem',
                padding: '0.5rem 0.875rem',
                marginLeft: 'var(--space-6)',
                background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(244, 63, 94, 0.08) 100%)',
                border: '1.5px solid rgba(244, 63, 94, 0.25)',
                borderRadius: 'var(--radius-xl)',
                color: 'var(--color-rose-600)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.875rem',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 8px rgba(244, 63, 94, 0.15)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.18) 0%, rgba(244, 63, 94, 0.12) 100%)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 63, 94, 0.25)'
                e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(244, 63, 94, 0.08) 100%)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(244, 63, 94, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.25)'
              }}
            >
              <span style={{ fontSize: '1rem' }}>🎟️</span>
              <span>{tokenCount}</span>
            </Link>
          )}
          
          <ul className="navbar-nav">
            <li>
              <Link 
                to="/browse" 
                className={`navbar-link ${isActive('/browse') ? 'active' : ''}`}
                aria-label="Connect"
              >
                <span>😍</span> Connect
              </Link>
            </li>
            <li>
              <Link 
                to="/matches" 
                className={`navbar-link ${isActive('/matches') ? 'active' : ''}`}
                aria-label="Matches"
              >
                <span>❤️</span> Matches
              </Link>
            </li>
            <li>
              <Link 
                to="/profile" 
                className={`navbar-link ${isActive('/profile') ? 'active' : ''}`}
              >
                <span>👤</span> Profile
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
                  <span>👑</span> Admin
                </Link>
              </li>
            )}
            <li className="navbar-logout-desktop">
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
      
      <main
        className="main-content"
        data-native-shell-bg={
          nativeMobileShell
            ? location.pathname === "/browse"
              ? "browse"
              : "gradient"
            : undefined
        }
      >
        <Outlet />
      </main>

      {nativeMobileShell && (
        <nav className="app-bottom-tabs" aria-label="Main navigation">
          <Link
            to="/browse"
            className={`app-bottom-tabs__item${isActive('/browse') ? ' app-bottom-tabs__item--active' : ''}`}
            aria-label="Connect"
          >
            {isActive('/browse') && <span className="app-bottom-tabs__glow" aria-hidden />}
            <span className="app-bottom-tabs__emoji">😍</span>
            <span className="app-bottom-tabs__label">Connect</span>
          </Link>
          <Link
            to="/matches"
            className={`app-bottom-tabs__item${isActive('/matches') ? ' app-bottom-tabs__item--active' : ''}`}
            aria-label="Matches"
          >
            {isActive('/matches') && <span className="app-bottom-tabs__glow" aria-hidden />}
            <span className="app-bottom-tabs__emoji">❤️</span>
            <span className="app-bottom-tabs__label">Matches</span>
          </Link>
          <Link
            to="/profile"
            className={`app-bottom-tabs__item${isActive('/profile') ? ' app-bottom-tabs__item--active' : ''}`}
          >
            {isActive('/profile') && <span className="app-bottom-tabs__glow" aria-hidden />}
            <span className="app-bottom-tabs__emoji">👤</span>
            <span className="app-bottom-tabs__label">Profile</span>
          </Link>
          <Link
            to="/settings"
            className={`app-bottom-tabs__item${isActive('/settings') ? ' app-bottom-tabs__item--active' : ''}`}
          >
            {isActive('/settings') && <span className="app-bottom-tabs__glow" aria-hidden />}
            <span className="app-bottom-tabs__emoji">⚙️</span>
            <span className="app-bottom-tabs__label">Settings</span>
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className={`app-bottom-tabs__item${isActive('/admin') ? ' app-bottom-tabs__item--active' : ''}`}
            >
              {isActive('/admin') && <span className="app-bottom-tabs__glow" aria-hidden />}
              <span className="app-bottom-tabs__emoji">👑</span>
              <span className="app-bottom-tabs__label">Admin</span>
            </Link>
          )}
        </nav>
      )}
      
      <footer className="app-footer-global" style={{
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
          <span>© {new Date().getFullYear()} Mulligan</span>
        </div>
      </footer>
    </div>
  )
}

