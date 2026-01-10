import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import CreateProfile from './pages/CreateProfile'
import Browse from './pages/Browse'
import Matches from './pages/Matches'
import MyProfile from './pages/MyProfile'
import Referrals from './pages/Referrals'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Layout from './components/Layout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  // Always call hooks at the top level, before any conditional returns
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="loading-screen-immersive">
        <div className="loading-bg-gradient"></div>
        <div className="loading-particles">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="loading-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        <div className="loading-orbs">
          <div className="loading-orb loading-orb-1"></div>
          <div className="loading-orb loading-orb-2"></div>
          <div className="loading-orb loading-orb-3"></div>
        </div>
        <div className="loading-content">
          <div className="loading-logo-container">
            <svg className="loading-logo" width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="loadingHeartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
                <filter id="loadingGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path 
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                fill="url(#loadingHeartGradient)"
                filter="url(#loadingGlow)"
              />
              <g className="loading-arrow-top">
                <circle cx="36" cy="10" r="3" fill="currentColor" opacity="0.9" />
                <path d="M30 10L36 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <path d="M33 7L36 10L33 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
              <g className="loading-arrow-bottom">
                <circle cx="12" cy="38" r="3" fill="currentColor" opacity="0.9" />
                <path d="M18 38L12 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <path d="M15 35L12 38L15 41" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </svg>
          </div>
          <h1 className="loading-title">Welcome Back</h1>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
          <p className="loading-subtitle">Preparing your experience</p>
        </div>
      </div>
    )
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  // Always call hooks at the top level, before any conditional returns
  const { isAuthenticated, isAdmin, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="loading-screen-immersive">
        <div className="loading-bg-gradient"></div>
        <div className="loading-particles">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="loading-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        <div className="loading-orbs">
          <div className="loading-orb loading-orb-1"></div>
          <div className="loading-orb loading-orb-2"></div>
          <div className="loading-orb loading-orb-3"></div>
        </div>
        <div className="loading-content">
          <div className="loading-logo-container">
            <svg className="loading-logo" width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="loadingHeartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
                <filter id="loadingGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path 
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                fill="url(#loadingHeartGradient)"
                filter="url(#loadingGlow)"
              />
            </svg>
          </div>
          <h1 className="loading-title">Loading Admin</h1>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        </div>
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  
  if (!isAdmin) {
    return <Navigate to="/browse" />
  }
  
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="loading-screen-immersive">
        <div className="loading-bg-gradient"></div>
        <div className="loading-particles">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="loading-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        <div className="loading-orbs">
          <div className="loading-orb loading-orb-1"></div>
          <div className="loading-orb loading-orb-2"></div>
          <div className="loading-orb loading-orb-3"></div>
        </div>
        <div className="loading-content">
          <div className="loading-logo-container">
            <svg className="loading-logo" width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="loadingHeartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
                <filter id="loadingGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path 
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                fill="url(#loadingHeartGradient)"
                filter="url(#loadingGlow)"
              />
            </svg>
          </div>
          <h1 className="loading-title">Mulligan</h1>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}

function AuthRedirectRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const [hasToken, setHasToken] = React.useState(false)
  
  // Reactively check token whenever isAuthenticated or loading changes
  React.useEffect(() => {
    const token = localStorage.getItem('token')
    setHasToken(!!token)
    console.log('AuthRedirectRoute token check:', { hasToken: !!token, isAuthenticated, loading })
  }, [isAuthenticated, loading])
  
  if (loading) {
    return (
      <div className="loading-screen-immersive">
        <div className="loading-bg-gradient"></div>
        <div className="loading-particles">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="loading-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        <div className="loading-orbs">
          <div className="loading-orb loading-orb-1"></div>
          <div className="loading-orb loading-orb-2"></div>
          <div className="loading-orb loading-orb-3"></div>
        </div>
        <div className="loading-content">
          <div className="loading-logo-container">
            <svg className="loading-logo" width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="loadingHeartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
                <filter id="loadingGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path 
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                fill="url(#loadingHeartGradient)"
                filter="url(#loadingGlow)"
              />
            </svg>
          </div>
          <h1 className="loading-title">Mulligan</h1>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        </div>
      </div>
    )
  }
  
  // Only redirect if we have both token AND authenticated state
  // This prevents redirecting when state is stale after logout
  // But allows redirect when login succeeds (token is set AND isAuthenticated becomes true)
  const shouldRedirect = isAuthenticated && hasToken
  
  console.log('AuthRedirectRoute final check:', { isAuthenticated, hasToken, shouldRedirect })
  
  if (shouldRedirect) {
    console.log('Redirecting authenticated user to /browse')
    return <Navigate to="/browse" replace />
  }
  
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/login" element={<AuthRedirectRoute><Login /></AuthRedirectRoute>} />
      <Route path="/signup" element={<AuthRedirectRoute><Signup /></AuthRedirectRoute>} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route element={<Layout />}>
        <Route path="/create-profile" element={<PrivateRoute><CreateProfile /></PrivateRoute>} />
        <Route path="/browse" element={<PrivateRoute><Browse /></PrivateRoute>} />
        <Route path="/matches" element={<PrivateRoute><Matches /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><MyProfile /></PrivateRoute>} />
        <Route path="/referrals" element={<PrivateRoute><Referrals /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>
    </Routes>
  )
}

