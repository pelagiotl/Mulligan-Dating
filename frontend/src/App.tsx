import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { io, Socket } from 'socket.io-client'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PhoneLogin from './pages/PhoneLogin'
import AgeGate from './pages/AgeGate'
import { isAgeGateAccepted } from './lib/ageGate'
import CreateProfile from './pages/CreateProfile'
import Browse from './pages/Browse'
import Matches from './pages/Matches'
import MyProfile from './pages/MyProfile'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Layout from './components/Layout'
import BrandMark from './components/BrandMark'
import SessionBootstrapScreen from './components/SessionBootstrapScreen'
import { hasStoredAuthToken } from './lib/authToken'

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
  // Always call hooks at the top level, before any conditional returns
  const { isAuthenticated, loading, user } = useAuth()
  
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
            <BrandMark size={80} className="loading-logo" alt="" />
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
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isAgeGateAccepted()) {
    return <Navigate to="/age-gate" replace />
  }
  
  return <>{children}</>
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
            <BrandMark size={80} className="loading-logo" alt="" />
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
  const { loading } = useAuth()

  if (loading && hasStoredAuthToken()) {
    return <SessionBootstrapScreen />
  }

  return <>{children}</>
}

function AuthRedirectRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, connectSetupComplete } = useAuth()
  
  if (loading && hasStoredAuthToken()) {
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
  const { isAuthenticated, loading, connectSetupComplete } = useAuth()

  if (loading && hasStoredAuthToken()) {
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

/** Connect/Matches require finished create-profile wizard (draft cleared) plus name, city+state, min photos. */
function RequireConnectSetup({ children }: { children: React.ReactNode }) {
  const { connectSetupComplete } = useAuth()
  if (!connectSetupComplete) {
    return <Navigate to="/create-profile" replace />
  }
  return <>{children}</>
}

/** URL for `frontend/public/match-sound.wav` (same asset as mobile). */
function matchSoundPublicUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}match-sound.wav`;
}

/** Web Audio fallback when WAV load/play fails (autoplay, etc.). */
function playSyntheticMatchNotificationSound(audioContextRef: React.MutableRefObject<AudioContext | null>): void {
  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioContext = audioContextRef.current;
    const duration = 0.6;
    const sampleRate = audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    const frequencies = [523.25, 659.25, 783.99];
    for (let freq = 0; freq < frequencies.length; freq++) {
      const frequency = frequencies[freq];
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const delay = freq * 0.1;
        const envelope = Math.exp(-t * 2) * (1 - Math.min(t / 0.3, 1));
        const phase = 2 * Math.PI * frequency * Math.max(0, t - delay);
        const wave =
          Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.3 + Math.sin(phase * 3) * 0.2;
        if (t >= delay) {
          data[i] += wave * envelope * 0.15;
        }
      }
    }
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = buffer;
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start();
    source.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.debug("Match notification sound not available");
  }
}

function playNewMatchNotificationSound(audioContextRef: React.MutableRefObject<AudioContext | null>): void {
  const audio = new Audio(matchSoundPublicUrl());
  audio.volume = 0.45;
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    playSyntheticMatchNotificationSound(audioContextRef);
  };
  audio.addEventListener("error", fallback, { once: true });
  void audio.play().catch(() => {
    fallback();
  });
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
  const audioContextRef = useRef<AudioContext | null>(null)

  const playMatchSound = useCallback(() => {
    playNewMatchNotificationSound(audioContextRef);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return

    // Set up global socket connection for match notifications
    const token = localStorage.getItem('token')
    if (!token) return

    const socketUrl: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || 'http://localhost:3001'
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
      setNotification(data.message)
      playMatchSound()
    })

    // Check for new matches notification stored during login
    const checkNotification = () => {
      const newMatchesMessage = localStorage.getItem('newMatchesNotification')
      if (newMatchesMessage) {
        console.log('✅ NewMatchesNotification: Found notification in localStorage:', newMatchesMessage)
        setNotification(newMatchesMessage)
        // Clear it from storage (but keep showing until user clicks)
        localStorage.removeItem('newMatchesNotification')
        localStorage.removeItem('newMatchesCount')
        // Play sound when notification appears
        playMatchSound()
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
      // Play sound when notification appears
      playMatchSound()
    }

    // Listen for storage events (for same-window updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'newMatchesNotification' && e.newValue) {
        console.log('✅ NewMatchesNotification: Storage event detected:', e.newValue)
        setNotification(e.newValue)
        localStorage.removeItem('newMatchesNotification')
        localStorage.removeItem('newMatchesCount')
        // Play sound when notification appears
        playMatchSound()
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
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [isAuthenticated, user, playMatchSound]) // Re-run when authentication state changes

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
      <Routes>
        <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
        <Route path="/login" element={<AuthRedirectRoute><PhoneLogin /></AuthRedirectRoute>} />
        <Route path="/signup" element={<AuthRedirectRoute><PhoneLogin /></AuthRedirectRoute>} />
        <Route path="/phone-login" element={<AuthRedirectRoute><PhoneLogin /></AuthRedirectRoute>} />
        <Route path="/age-gate" element={<AgeGateRoute><AgeGate /></AgeGateRoute>} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route element={<Layout />}>
          <Route path="/create-profile" element={<PrivateRoute><CreateProfile /></PrivateRoute>} />
          <Route path="/browse" element={<PrivateRoute><RequireConnectSetup><Browse /></RequireConnectSetup></PrivateRoute>} />
          <Route path="/matches" element={<PrivateRoute><RequireConnectSetup><Matches /></RequireConnectSetup></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><MyProfile /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        </Route>
      </Routes>
    </>
  )
}

