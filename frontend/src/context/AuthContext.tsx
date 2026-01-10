import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { api } from '../utils/api'

interface User {
  id: string
  email: string
  isAdmin?: boolean
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
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ hasProfile: boolean }>
  signup: (email: string, password: string, referralCode?: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => Promise<void>
  logout: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetchUser().catch(() => {
        // Silently fail on initial load - user will need to login
        // fetchUser's finally block already sets loading to false
      })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUser = async () => {
    setLoading(true)
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
        throw new Error('No authentication token found')
      }
      
      const data: any = await api.get('/auth/me')
      
      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return
      }
      
      if (!data || !data.user) {
        throw new Error('Invalid response from server')
      }
      
      setUser({
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.isAdmin || false
      })
      setProfile(data.profile || null)
    } catch (error: any) {
      // Ignore aborted requests
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return
      }
      
      // Clear invalid token and reset state
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
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
      setLoading(true)
      
      const data: any = await api.post('/auth/login', { email, password })
      
      if (!data.token) {
        throw new Error('No token received from server')
      }
      
      localStorage.setItem('token', data.token)
      
      // Fetch user data - let it handle loading state
      await fetchUser()
      
      // Return hasProfile
      return { hasProfile: data.hasProfile || false }
    } catch (error: any) {
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setLoading(false)
      throw error
    }
  }

  const signup = async (email: string, password: string, referralCode?: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => {
    const data: any = await api.post('/auth/signup', { 
      email, 
      password, 
      referralCode: referralCode || undefined,
      acceptTerms: acceptTerms || false,
      acceptPrivacy: acceptPrivacy || false
    })
    localStorage.setItem('token', data.token)
    setUser({ id: data.userId, email })
  }

  const logout = () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Clear token and state
    localStorage.removeItem('token')
    setUser(null)
    setProfile(null)
    setLoading(false)
  }

  const refreshProfile = async () => {
    try {
      const data: any = await api.get('/profile')
      if (data.profile) {
        setProfile(data.profile)
        console.log('Profile refreshed:', data.profile)
      } else {
        setProfile(null)
      }
    } catch (error) {
      console.error('Failed to refresh profile:', error)
      // Profile might not exist yet, set to null
      setProfile(null)
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      isAuthenticated: !!user,
      isAdmin: user?.isAdmin || false,
      loading, 
      login, 
      signup, 
      logout,
      refreshProfile 
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

