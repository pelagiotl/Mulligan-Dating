import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import {
  TOKEN_BALANCE_UPDATED_EVENT,
  type TokenBalanceDetail,
} from '../lib/tokenBalanceEvents'
import MaintenanceBanner from './MaintenanceBanner'
import BrandMark from './BrandMark'
import TokenDisplay from './TokenDisplay'
import WebTokenPurchase from './WebTokenPurchase'

export default function Layout() {
  // Always call hooks at the top level, before any conditional logic
  // This ensures hooks are called in the same order on every render
  const { logout, isAdmin, isAuthenticated, profile, loading: authLoading, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tokenCount, setTokenCount] = useState<number | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)

  const isActive = (path: string) => location.pathname === path
  const connectPath =
    isAuthenticated && !authLoading && !profile ? '/create-profile' : '/browse'
  /** Hide main nav Connect entry while user is in the create-profile wizard (splash still offers browse). */
  const hideConnectNav = location.pathname === '/create-profile'
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

  // Navbar badge: stay in sync when TokenDisplay (or elsewhere) refreshes balance
  useEffect(() => {
    const onBalance = (e: Event) => {
      const ce = e as CustomEvent<TokenBalanceDetail>
      const n = ce.detail?.availableTokens
      if (typeof n === 'number' && !Number.isNaN(n)) {
        setTokenCount(n)
      }
    }
    window.addEventListener(TOKEN_BALANCE_UPDATED_EVENT, onBalance as EventListener)
    return () =>
      window.removeEventListener(TOKEN_BALANCE_UPDATED_EVENT, onBalance as EventListener)
  }, [])

  const fetchTokenCount = async () => {
    try {
      const data = await api.get<{ availableTokens: number }>("/tokens")
      setTokenCount(data.availableTokens)
    } catch (err) {
      // Silently fail - token count is not critical for navbar
      console.error('Failed to fetch token count:', err)
    }
  }

  const closeTokenModal = useCallback(() => setShowTokenModal(false), [])

  useEffect(() => {
    if (!showTokenModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTokenModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTokenModal, closeTokenModal])

  return (
    <div
      className={`app-layout${nativeMobileShell ? ' app-layout--native-mobile-shell' : ''}`}
    >
      <MaintenanceBanner />
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to={connectPath} className="navbar-logo">
            <span className="navbar-logo-icon">
              <BrandMark size={32} alt="" />
            </span>
            <span className="navbar-logo-text">Mulligan</span>
          </Link>
          
          {/* Token Count Badge */}
          {isAuthenticated && tokenCount !== null && (
            <button
              type="button"
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
                fontWeight: 700,
                fontSize: '0.875rem',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 8px rgba(244, 63, 94, 0.15)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onClick={() => setShowTokenModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showTokenModal}
              aria-controls="navbar-token-dialog"
            >
              <span style={{ fontSize: '1rem' }} aria-hidden>🎟️</span>
              <span>{tokenCount}</span>
              <span className="sr-only">Open token details</span>
            </button>
          )}
          
          <ul className="navbar-nav">
            {!hideConnectNav ? (
              <li>
                <Link
                  to={connectPath}
                  className={`navbar-link ${isActive('/browse') ? 'active' : ''}`}
                  aria-label="Connect"
                >
                  <span>😍</span> Connect
                </Link>
              </li>
            ) : null}
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
            to={connectPath}
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
      
      {showTokenModal ? (
        <div className="navbar-token-modal-overlay" role="presentation">
          <button
            type="button"
            className="navbar-token-modal-backdrop"
            aria-label="Close token details"
            onClick={closeTokenModal}
          />
          <div
            id="navbar-token-dialog"
            className="navbar-token-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="navbar-token-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="navbar-token-modal-head">
              <h2 id="navbar-token-modal-title">Mulligan tokens</h2>
              <button
                type="button"
                className="navbar-token-modal-close"
                onClick={closeTokenModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="navbar-token-modal-lede">
              You have <strong>{tokenCount}</strong> available. Use tokens to match with people — claim your weekly refill
              or buy more when you&apos;re running low.
            </p>
            <TokenDisplay />
            <div className="navbar-token-modal-purchase">
              <p className="navbar-token-modal-purchase-label">Get more tokens</p>
              <WebTokenPurchase variant="settings" customerEmail={user?.email} />
            </div>
            <div className="navbar-token-modal-footer">
              <Link to="/settings#tokens" className="btn btn-ghost btn-sm" onClick={closeTokenModal}>
                Open full Settings
              </Link>
            </div>
          </div>
        </div>
      ) : null}

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

