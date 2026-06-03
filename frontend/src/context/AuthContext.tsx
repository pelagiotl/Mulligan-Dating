import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from 'react'
import { api } from '../utils/api'
import { browserSupportsWebPush, getVapidPublicKey, syncWebPushSubscription } from '../lib/webPush'
import {
  deriveAppRegistrationComplete,
  isAccountActiveFromAuthUser,
} from '../utils/connectProfileEligibility'
import {
  clearWebCreateProfileDraft,
  ensureWebOnboardingDraft,
  hasWebCreateProfileDraft,
} from '../utils/createProfileProgress'
import { clearAgeGateAccepted } from '../lib/ageGate'
import { resetConnectShellModeForNewUser } from '../lib/connectShellTheme'
import { hasStoredAuthToken } from '../lib/authToken'
import { suppressMatchSoundFor } from '../utils/matchSound'

/** Same as mobile `MainTabs`: owner line always sees admin UI (API `requireAdmin` already matches this number). */
function isOwnerAdminPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  return /^(1)?5413163939$/.test(phone.replace(/\D/g, ''))
}

interface User {
  id: string
  email: string
  phoneNumber?: string | null
  isAdmin?: boolean
  hasPushToken?: boolean
  webPushConfigured?: boolean
  webPushSubscriptionCount?: number
  accountActive?: boolean
  accountStatus?: string
  matchmakingEnabled?: boolean
  matchmakingDisabledMessage?: string | null
}

interface Profile {
  id: string
  displayName: string
  age: number
  gender: string
  location?: string
  bio?: string
  photoUrl?: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  /** True when name + location are set, account is active, and create-profile wizard was finished. */
  connectSetupComplete: boolean
  photoCount: number
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ connectSetupComplete: boolean }>
  signup: (email: string, password: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => Promise<void>
  phoneLogin: (phoneNumber: string, code: string) => Promise<{ connectSetupComplete: boolean }>
  logout: () => void
  refreshProfile: (options?: { silent?: boolean }) => Promise<{ connectSetupComplete: boolean }>
  /** Re-fetch /auth/me (e.g. after saving Web Push subscription). */
  refreshSession: () => Promise<{ connectSetupComplete: boolean }>
  /** After create-profile wizard finishes — keeps /browse gate open before /auth/me catches up. */
  markConnectSetupComplete: () => void
  /** Immediately reflect a saved settings email in session (before /auth/me round-trip). */
  updateUserEmail: (email: string) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [connectSetupComplete, setConnectSetupComplete] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)
  /** Only block the UI when we need to validate an existing session. */
  const [loading, setLoading] = useState(hasStoredAuthToken)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    let cancelled = false
    const bootTimeoutId = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 25000)

    const finishBoot = () => {
      cancelled = true
      window.clearTimeout(bootTimeoutId)
    }

    if (token) {
      void fetchUser()
        .catch((error) => {
          console.log('Token invalid or expired, clearing:', error)
          localStorage.removeItem('token')
          setUser(null)
          setProfile(null)
          setConnectSetupComplete(false)
          setLoading(false)
        })
        .finally(finishBoot)
    } else {
      setUser(null)
      setProfile(null)
      setConnectSetupComplete(false)
      setLoading(false)
      finishBoot()
    }
    return () => {
      finishBoot()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUser = async (options?: {
    silent?: boolean
  }): Promise<{ connectSetupComplete: boolean }> => {
    if (!options?.silent) {
      setLoading(true)
      setConnectSetupComplete(false)
    }
    try {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Verify token exists before making request
      const token = localStorage.getItem('token')
      if (!token) {
        setUser(null)
        setProfile(null)
        setConnectSetupComplete(false)
        return { connectSetupComplete: false }
      }
      
      const data: any = await api.get('/auth/me')
      
      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return { connectSetupComplete: false }
      }
      
      if (!data || !data.user) {
        throw new Error('Invalid response from server')
      }
      
      const u = data.user
      const phoneNumber = u.phoneNumber ?? u.phone_number ?? null
      const serverIsAdmin = !!(u.isAdmin ?? u.is_admin)
      const serverEmail =
        typeof u.email === 'string' ? u.email.trim() : ''
      setUser((prev) => ({
        id: u.id,
        email: serverEmail || prev?.email || '',
        phoneNumber,
        isAdmin: serverIsAdmin,
        hasPushToken: !!data.user.hasPushToken,
        webPushConfigured: !!data.user.webPushConfigured,
        webPushSubscriptionCount: typeof data.user.webPushSubscriptionCount === 'number' ? data.user.webPushSubscriptionCount : 0,
        accountActive: u.accountActive,
        accountStatus: u.accountStatus,
        matchmakingEnabled: data.matchmakingEnabled !== false,
        matchmakingDisabledMessage:
          typeof data.matchmakingDisabledMessage === 'string' ? data.matchmakingDisabledMessage : null,
      }))
      const rawProfile = data.profile || null
      setProfile(rawProfile)

      let nextPhotoCount =
        typeof data.photoCount === 'number' && Number.isFinite(data.photoCount) ? data.photoCount : 0
      if (typeof data.photoCount !== 'number') {
        try {
          const pm = await api.get<{ photos?: unknown[] }>('/photos/me')
          nextPhotoCount = Array.isArray(pm.photos) ? pm.photos.length : 0
        } catch {
          nextPhotoCount = 0
        }
      }
      setPhotoCount(nextPhotoCount)

      const accountActive = isAccountActiveFromAuthUser({
        accountActive: u.accountActive,
        accountStatus: u.accountStatus,
      })
      if (!accountActive) {
        ensureWebOnboardingDraft()
      }
      const wizardDraftActive = hasWebCreateProfileDraft()
      const complete = deriveAppRegistrationComplete({
        accountActive,
        profileRow: rawProfile,
        photoCount: nextPhotoCount,
        wizardDraftActive,
        serverConnectFlag: data.connectSetupComplete,
      })
      if (complete) {
        clearWebCreateProfileDraft()
      }
      setConnectSetupComplete(complete)
      if (!options?.silent) {
        suppressMatchSoundFor(6000)
      }
      return { connectSetupComplete: complete }
    } catch (error: any) {
      // Ignore aborted requests
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return { connectSetupComplete: false }
      }

      if (options?.silent) {
        console.warn('Session refresh failed (silent):', error)
        return { connectSetupComplete: false }
      }

      // Clear invalid token and reset state
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setConnectSetupComplete(false)
      // Re-throw so login can handle it
      throw error
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }

  const markConnectSetupComplete = () => {
    clearWebCreateProfileDraft()
    setConnectSetupComplete(true)
  }

  const updateUserEmail = (email: string) => {
    const trimmed = email.trim()
    if (!trimmed) return
    setUser((prev) => (prev ? { ...prev, email: trimmed } : prev))
  }

  // Legacy email/password login (kept for backward compatibility)
  const login = async (email: string, password: string) => {
    try {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      
      // Reset state before login
      setUser(null)
      setProfile(null)
      setConnectSetupComplete(false)
      
      const data: any = await api.post('/auth/login', { email, password })
      
      if (!data.token) {
        throw new Error('No token received from server')
      }
      
      localStorage.setItem('token', data.token)
      
      // Fetch user data - it handles loading state itself
      const { connectSetupComplete: ready } = await fetchUser()
      
      // Check for new matches created since last login
      // Do this immediately after login to show notification right away
      try {
        const lastLoginTime = localStorage.getItem('lastLoginTime')
        const now = new Date().toISOString()
        
        const matches = await api.get<{ matches: Array<{ id: string; createdAt: string; otherUser: { displayName: string } }> }>('/matches')
        
        let newMatches: Array<{ id: string; createdAt: string; otherUser: { displayName: string } }> = []
        
        if (lastLoginTime) {
          // Compare against last login time
          const lastLogin = new Date(lastLoginTime)
          newMatches = matches.matches.filter(match => {
            const matchDate = new Date(match.createdAt)
            return matchDate > lastLogin
          })
        } else {
          // First login - check for matches created in the last 24 hours
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
          newMatches = matches.matches.filter(match => {
            const matchDate = new Date(match.createdAt)
            return matchDate > twentyFourHoursAgo
          })
        }
        
        if (newMatches.length > 0) {
          // Store new matches notification to show immediately
          const matchNames = newMatches.map(m => m.otherUser.displayName).join(', ')
          const message = newMatches.length === 1 
            ? `😍 New match! ${matchNames} matched with you. Say hi! — open Chats.`
            : `😍 ${newMatches.length} new matches: ${matchNames} — open Chats to say hi!`
          
          console.log('✅ New matches found on login:', newMatches.length, matchNames)
          console.log('✅ Storing notification in localStorage:', message)
          localStorage.setItem('newMatchesNotification', message)
          localStorage.setItem('newMatchesCount', newMatches.length.toString())
          
          // Trigger a custom event to notify the NewMatchesNotification component immediately
          window.dispatchEvent(new CustomEvent('newMatchesDetected', { detail: { message } }))
          
          // Also trigger a storage event in case the component is listening for that
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'newMatchesNotification',
            newValue: message,
            storageArea: localStorage
          }))
        } else {
          console.log('ℹ️ No new matches found on login')
        }
        
        // Update last login time
        localStorage.setItem('lastLoginTime', now)
      } catch (err) {
        // Silently fail - matches check is not critical for login
        console.log('Could not check for new matches:', err)
        // Still update last login time even if matches check fails
        localStorage.setItem('lastLoginTime', new Date().toISOString())
      }
      
      return { connectSetupComplete: ready }
    } catch (error: any) {
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setConnectSetupComplete(false)
      setLoading(false)
      throw error
    }
  }

  const signup = async (email: string, password: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => {
    const data: any = await api.post('/auth/signup', { 
      email, 
      password, 
      acceptTerms: acceptTerms || false,
      acceptPrivacy: acceptPrivacy || false
    })
    localStorage.setItem('token', data.token)
    setUser({ id: data.userId, email })
    resetConnectShellModeForNewUser(data.userId)
  }

  const phoneLogin = async (phoneNumber: string, code: string): Promise<{ connectSetupComplete: boolean }> => {
    const data: any = await api.post('/sms/verify-code', {
      phoneNumber,
      code,
      acceptTerms: true,
      acceptPrivacy: true
    })
    
    // Store token
    localStorage.setItem('token', data.token)

    // New phone signup must not reuse wizard draft/photos from a deleted prior account on this device.
    if (data.isNewUser) {
      clearWebCreateProfileDraft()
      const newUserId = data.userId ?? data.user?.id
      if (newUserId) {
        resetConnectShellModeForNewUser(newUserId)
      }
    }

    const { connectSetupComplete: ready } = await fetchUser()
    return { connectSetupComplete: ready }
  }

  const logout = () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Clear token and state
    localStorage.removeItem('token')
    clearWebCreateProfileDraft()
    clearAgeGateAccepted()
    setUser(null)
    setProfile(null)
    setConnectSetupComplete(false)
    setLoading(false)
  }

  const refreshProfile = async (options?: { silent?: boolean }) => {
    return fetchUser(options)
  }

  const refreshSession = async (options?: { silent?: boolean }) => {
    return fetchUser(options)
  }

  useEffect(() => {
    if (!user?.id || !user.webPushConfigured || !getVapidPublicKey()) return
    if (!browserSupportsWebPush()) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    let debounce: ReturnType<typeof setTimeout> | null = null
    const sync = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        syncWebPushSubscription()
          .then((ok) => {
            if (ok) void refreshSession({ silent: true })
          })
          .catch((e) => console.warn('[WebPush] background sync:', e))
      }, 800)
    }

    const t = window.setTimeout(sync, 1200)

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)

    return () => {
      window.clearTimeout(t)
      if (debounce) clearTimeout(debounce)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSession is stable enough; avoid re-subscribe loops
  }, [user?.id, user?.webPushConfigured])

  const isAdmin = useMemo(
    () => !!(user?.isAdmin || isOwnerAdminPhone(user?.phoneNumber)),
    [user?.isAdmin, user?.phoneNumber],
  )

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      connectSetupComplete,
      photoCount,
      isAuthenticated: !!user,
      isAdmin,
      loading, 
      login, 
      signup,
      phoneLogin,
      logout,
      refreshProfile,
      refreshSession,
      markConnectSetupComplete,
      updateUserEmail,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

