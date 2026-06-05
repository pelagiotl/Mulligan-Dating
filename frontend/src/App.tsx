import React, { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { io, Socket } from 'socket.io-client'
import { getSocketUrl } from './utils/socketUrl'
import { isAgeGateAccepted } from './lib/ageGate'
import { lazyRoute } from './lazyRoute'
import PhoneLogin from './pages/PhoneLogin'
import AgeGate from './pages/AgeGate'
import TabRouteSuspense from './components/TabRouteSuspense'
import SessionBootstrapScreen from './components/SessionBootstrapScreen'
import RouteChunkFallback from './components/RouteChunkFallback'
import { playMatchCelebrationSound } from './utils/matchSound'
import WebMessageNotifications from './components/WebMessageNotifications'
import LaunchGoLiveCelebrationGate from './components/LaunchGoLiveCelebrationGate'
import { isIncomingMatchForConnectInitiator } from './lib/connectInitiator'

const Layout = lazyRoute(() => import('./components/Layout'))
const Landing = lazyRoute(() => import('./pages/Landing'))
const CreateProfile = lazyRoute(() => import('./pages/CreateProfile'))
const Browse = lazyRoute(() => import('./pages/Browse'))
const Matches = lazyRoute(() => import('./pages/Matches'))
const MyProfile = lazyRoute(() => import('./pages/MyProfile'))
const Settings = lazyRoute(() => import('./pages/Settings'))
const Admin = lazyRoute(() => import('./pages/Admin'))
const Terms = lazyRoute(() => import('./pages/Terms'))
const Privacy = lazyRoute(() => import('./pages/Privacy'))

const PWA_OPEN_PARAM = 'pwaOpen'

/** Service worker opens /?pwaOpen=... on notification tap (reliable index.html on iOS cold start). */
function PwaPushLaunchRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const raw = params.get(PWA_OPEN_PARAM)
    if (!raw) return
    let path: string
    try {
      path = decodeURIComponent(raw)
    } catch {
      return
    }
    if (!path.startsWith('/') || path.startsWith('//')) return
    navigate(path, { replace: true })
  }, [location.search, navigate])
  return null
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoringSession } = useAuth()

  if (restoringSession) {
    return <SessionBootstrapScreen title="Welcome back" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isAgeGateAccepted()) {
    return <Navigate to="/age-gate" replace />
  }
  
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, restoringSession } = useAuth()

  if (restoringSession) {
    return <SessionBootstrapScreen title="Welcome back" />
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
  const { restoringSession } = useAuth()

  if (restoringSession) {
    return <SessionBootstrapScreen />
  }

  return <>{children}</>
}

function AuthRedirectRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoringSession, connectSetupComplete } = useAuth()

  if (restoringSession) {
    return <SessionBootstrapScreen />
  }
  
  if (isAuthenticated) {
    if (!isAgeGateAccepted()) {
      return <Navigate to="/age-gate" replace />
    }
    return <Navigate to={connectSetupComplete ? '/browse' : '/create-profile'} replace />
  }
  
  return <>{children}</>
}

/** Logged-in users only; used for age gate (before 18+ confirmation). */
function AgeGateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, restoringSession, connectSetupComplete } = useAuth()

  if (restoringSession) {
    return <SessionBootstrapScreen title="Welcome back" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isAgeGateAccepted()) {
    return <Navigate to={connectSetupComplete ? '/browse' : '/create-profile'} replace />
  }

  return <>{children}</>
}

/** Connect/Matches require finished create-profile wizard (draft cleared) plus name and city+state. */
function RequireConnectSetup({ children }: { children: React.ReactNode }) {
  const { connectSetupComplete } = useAuth()
  if (!connectSetupComplete) {
    return <Navigate to="/create-profile" replace />
  }
  return <>{children}</>
}

/** Same layer as `.notification` (13000): above celebrations / browse UI, above navbar token modal (12000). */
const GLOBAL_TOAST_Z = 13000;

// Global notification component for new matches after login
function NewMatchesNotification() {
  const [notification, setNotification] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user) return

    // Set up global socket connection for match notifications
    const token = localStorage.getItem('token')
    if (!token) return

    const socketUrl = getSocketUrl()
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('✅ NewMatchesNotification: Connected to WebSocket server')
    })

    socket.on('disconnect', () => {
      console.log('❌ NewMatchesNotification: Disconnected from WebSocket server')
    })

    // Listen for new_match events from socket
    socket.on('new_match', (data: { matchId: string; otherUserId: string; otherUserName: string; message: string; stage: string }) => {
      console.log('✅ NewMatchesNotification: Received new_match event via socket:', data)
      if (!isIncomingMatchForConnectInitiator(data.matchId)) {
        playMatchCelebrationSound()
        navigate('/matches', { state: { openMatchId: data.matchId } })
      }
      setNotification(data.message)
    })

    // Check for new matches notification stored during login (toast only — no sound)
    const checkNotification = () => {
      const newMatchesMessage = localStorage.getItem('newMatchesNotification')
      if (newMatchesMessage) {
        console.log('✅ NewMatchesNotification: Found notification in localStorage:', newMatchesMessage)
        setNotification(newMatchesMessage)
        // Clear it from storage (but keep showing until user clicks)
        localStorage.removeItem('newMatchesNotification')
        localStorage.removeItem('newMatchesCount')
        return true
      } else {
        console.log('ℹ️ NewMatchesNotification: No notification found in localStorage')
        return false
      }
    }

    // Check immediately
    checkNotification()

    // Also listen for custom event when matches are detected during login
    const handleNewMatches = (event: CustomEvent) => {
      console.log('✅ NewMatchesNotification: Received newMatchesDetected event:', event.detail)
      setNotification(event.detail.message)
      localStorage.removeItem('newMatchesNotification')
      localStorage.removeItem('newMatchesCount')
    }

    // Listen for storage events (for same-window updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'newMatchesNotification' && e.newValue) {
        console.log('✅ NewMatchesNotification: Storage event detected:', e.newValue)
        setNotification(e.newValue)
        localStorage.removeItem('newMatchesNotification')
        localStorage.removeItem('newMatchesCount')
      }
    }

    window.addEventListener('newMatchesDetected', handleNewMatches as EventListener)
    window.addEventListener('storage', handleStorageChange)

    // Re-check periodically for a short time after login (in case check happens after component mounts)
    const intervalId = setInterval(() => {
      if (checkNotification()) {
        clearInterval(intervalId)
      }
    }, 500) // Check every 500ms

    // Stop checking after 5 seconds
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId)
    }, 5000)

    return () => {
      window.removeEventListener('newMatchesDetected', handleNewMatches as EventListener)
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(intervalId)
      clearTimeout(timeoutId)
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [isAuthenticated, user, navigate])

  if (!notification) return null

  const banner = (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'max(20px, env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 50%, #be123c 100%)',
        color: 'white',
        padding: '20px 32px',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(244, 63, 94, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        zIndex: GLOBAL_TOAST_Z,
        maxWidth: '90%',
        textAlign: 'center',
        cursor: 'pointer',
        animation: 'slideDown 0.5s ease-out, pulse 2s ease-in-out infinite',
        backdropFilter: 'blur(10px)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        overflow: 'hidden',
      }}
      onClick={() => {
        setNotification(null)
        navigate('/matches')
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)'
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(244, 63, 94, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(244, 63, 94, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)'
      }}
    >
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 8px 32px rgba(244, 63, 94, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
          }
          50% {
            box-shadow: 0 8px 32px rgba(244, 63, 94, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 20px rgba(244, 63, 94, 0.3);
          }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        fontSize: '1.2rem',
        animation: 'sparkle 2s ease-in-out infinite',
        animationDelay: '0s'
      }}>✨</div>
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        fontSize: '1.2rem',
        animation: 'sparkle 2s ease-in-out infinite',
        animationDelay: '1s'
      }}>💬</div>
      <div style={{
        fontSize: '1.1rem',
        fontWeight: '600',
        marginBottom: '8px',
        textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        letterSpacing: '0.5px'
      }}>
        {notification}
      </div>
      <div style={{
        fontSize: '0.9rem',
        marginTop: '8px',
        opacity: 0.95,
        fontStyle: 'italic',
        textShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
      }}>
        Open Chats →
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(banner, document.body)
}

export default function App() {
  return (
    <>
      <PwaPushLaunchRedirect />
      <NewMatchesNotification />
      <WebMessageNotifications />
      <LaunchGoLiveCelebrationGate />
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<RouteChunkFallback />}>
              <PublicRoute>
                <Landing />
              </PublicRoute>
            </Suspense>
          }
        />
        <Route
          path="/login"
          element={
            <AuthRedirectRoute>
              <PhoneLogin />
            </AuthRedirectRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <AuthRedirectRoute>
              <PhoneLogin />
            </AuthRedirectRoute>
          }
        />
        <Route
          path="/phone-login"
          element={
            <AuthRedirectRoute>
              <PhoneLogin />
            </AuthRedirectRoute>
          }
        />
        <Route
          path="/age-gate"
          element={
            <AgeGateRoute>
              <AgeGate />
            </AgeGateRoute>
          }
        />
        <Route
          path="/terms"
          element={
            <Suspense fallback={<RouteChunkFallback />}>
              <Terms />
            </Suspense>
          }
        />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<RouteChunkFallback />}>
              <Privacy />
            </Suspense>
          }
        />
        <Route
          element={
            <Suspense fallback={<RouteChunkFallback />}>
              <Layout />
            </Suspense>
          }
        >
          <Route
            path="/create-profile"
            element={
              <TabRouteSuspense>
                <PrivateRoute>
                  <CreateProfile />
                </PrivateRoute>
              </TabRouteSuspense>
            }
          />
          <Route
            path="/browse"
            element={
              <TabRouteSuspense>
                <PrivateRoute>
                  <RequireConnectSetup>
                    <Browse />
                  </RequireConnectSetup>
                </PrivateRoute>
              </TabRouteSuspense>
            }
          />
          <Route
            path="/matches"
            element={
              <TabRouteSuspense>
                <PrivateRoute>
                  <RequireConnectSetup>
                    <Matches />
                  </RequireConnectSetup>
                </PrivateRoute>
              </TabRouteSuspense>
            }
          />
          <Route
            path="/profile"
            element={
              <TabRouteSuspense>
                <PrivateRoute>
                  <MyProfile />
                </PrivateRoute>
              </TabRouteSuspense>
            }
          />
          <Route
            path="/settings"
            element={
              <TabRouteSuspense>
                <PrivateRoute>
                  <Settings />
                </PrivateRoute>
              </TabRouteSuspense>
            }
          />
          <Route
            path="/admin"
            element={
              <TabRouteSuspense>
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              </TabRouteSuspense>
            }
          />
        </Route>
      </Routes>
    </>
  )
}

