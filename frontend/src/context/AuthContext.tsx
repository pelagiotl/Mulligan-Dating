import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from 'react'
import { api } from '../utils/api'
import { browserSupportsWebPush, getVapidPublicKey, registerWebPush } from '../lib/webPush'
import { computeAppConnectReady } from '../utils/connectProfileEligibility'
import { clearWebCreateProfileDraft, hasWebCreateProfileDraft } from '../utils/createProfileProgress'
import { clearAgeGateAccepted } from '../lib/ageGate'

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
  /** True when Connect rules are met and create-profile wizard was finished (no in-progress draft). */
  connectSetupComplete: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ connectSetupComplete: boolean }>
  signup: (email: string, password: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => Promise<void>
  phoneLogin: (phoneNumber: string, code: string) => Promise<{ connectSetupComplete: boolean }>
  logout: () => void
  refreshProfile: () => Promise<void>
  /** Re-fetch /auth/me (e.g. after saving Web Push subscription). */
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [connectSetupComplete, setConnectSetupComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetchUser().catch((error) => {
        // If token is invalid, clear it and show login page
        console.log('Token invalid or expired, clearing:', error)
        localStorage.removeItem('token')
        setUser(null)
        setProfile(null)
        setConnectSetupComplete(false)
        setLoading(false)
      })
    } else {
      setUser(null)
      setProfile(null)
      setConnectSetupComplete(false)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user?.id || !user.webPushConfigured || !getVapidPublicKey()) return
    if (!browserSupportsWebPush()) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const t = window.setTimeout(() => {
      registerWebPush().catch((e) => console.warn('[WebPush] background register:', e))
    }, 2800)
    return () => window.clearTimeout(t)
  }, [user?.id, user?.webPushConfigured])

  const fetchUser = async (): Promise<{ connectSetupComplete: boolean }> => {
    setLoading(true)
    setConnectSetupComplete(false)
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
      setUser({
        id: u.id,
        email: u.email,
        phoneNumber,
        isAdmin: serverIsAdmin,
        hasPushToken: !!data.user.hasPushToken,
        webPushConfigured: !!data.user.webPushConfigured,
        webPushSubscriptionCount: typeof data.user.webPushSubscriptionCount === 'number' ? data.user.webPushSubscriptionCount : 0,
      })
      const rawProfile = data.profile || null
      setProfile(rawProfile)

      let photoCount = 0
      try {
        const pm = await api.get<{ photos?: unknown[] }>('/photos/me')
        photoCount = Array.isArray(pm.photos) ? pm.photos.length : 0
      } catch {
        photoCount = 0
      }

      const complete = computeAppConnectReady(rawProfile, photoCount, hasWebCreateProfileDraft())
      setConnectSetupComplete(complete)
      return { connectSetupComplete: complete }
    } catch (error: any) {
      // Ignore aborted requests
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
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
      setLoading(false)
    }
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

  const refreshProfile = async () => {
    try {
      const data: any = await api.get('/profile')
      if (data.profile) {
        setProfile(data.profile)
        console.log('Profile refreshed:', data.profile)
        let photoCount = 0
        try {
          const pm = await api.get<{ photos?: unknown[] }>('/photos/me')
          photoCount = Array.isArray(pm.photos) ? pm.photos.length : 0
        } catch {
          photoCount = 0
        }
        setConnectSetupComplete(computeAppConnectReady(data.profile, photoCount, hasWebCreateProfileDraft()))
      } else {
        setProfile(null)
        setConnectSetupComplete(false)
      }
    } catch (error) {
      console.error('Failed to refresh profile:', error)
      // Profile might not exist yet, set to null
      setProfile(null)
      setConnectSetupComplete(false)
    }
  }

  const refreshSession = async () => {
    await fetchUser()
  }

  const isAdmin = useMemo(
    () => !!(user?.isAdmin || isOwnerAdminPhone(user?.phoneNumber)),
    [user?.isAdmin, user?.phoneNumber],
  )

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      connectSetupComplete,
      isAuthenticated: !!user,
      isAdmin,
      loading, 
      login, 
      signup,
      phoneLogin,
      logout,
      refreshProfile,
      refreshSession,
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

