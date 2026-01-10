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
      fetchUser().catch((error) => {
        console.error('Error in initial fetchUser:', error)
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUser = async () => {
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
      
      console.log('Fetching user data with token:', token.substring(0, 20) + '...')
      const data: any = await api.get('/auth/me')
      
      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return
      }
      
      if (!data || !data.user) {
        throw new Error('Invalid response from server')
      }
      
      console.log('User data from /auth/me:', data.user) // Debug log
      setUser({
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.isAdmin || false
      })
      console.log('isAdmin set to:', data.user.isAdmin || false) // Debug log
      setProfile(data.profile || null)
    } catch (error: any) {
      // Ignore aborted requests
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        console.log('Request was aborted')
        return
      }
      
      console.error('Failed to fetch user:', error)
      console.error('Error details:', {
        message: error?.message,
        status: error?.status,
        name: error?.name
      })
      
      // Clear invalid token and reset state
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setLoading(false)
      
      // Don't re-throw in initial load - just log and continue
      // This prevents white screen if token is invalid
    } finally {
      setLoading(false)
    }
  }

  // Legacy email/password login (kept for backward compatibility)
  const login = async (email: string, password: string) => {
    try {
      console.log('Starting login process for:', email)
      
      // Cancel any pending requests first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // Clear any existing token first to avoid conflicts
      const oldToken = localStorage.getItem('token')
      if (oldToken) {
        console.log('Clearing old token before login')
        localStorage.removeItem('token')
      }
      
      // Reset state before login
      setUser(null)
      setProfile(null)
      setLoading(true)
      
      // Small delay to ensure state is cleared
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const data: any = await api.post('/auth/login', { email, password })
      console.log('Login API call successful, received token:', !!data.token)
      
      // Ensure token is set before fetching user
      if (!data.token) {
        throw new Error('No token received from server')
      }
      
      localStorage.setItem('token', data.token)
      console.log('Token saved to localStorage')
      
      // Small delay to ensure token is persisted and available
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify token is available before making request
      const tokenCheck = localStorage.getItem('token')
      if (!tokenCheck) {
        throw new Error('Token was not properly saved')
      }
      
      console.log('Fetching user data after login...')
      try {
        await fetchUser()
        console.log('Login complete, user data fetched')
      } catch (fetchError: any) {
        console.error('fetchUser failed after login:', fetchError)
        // Even if fetchUser fails, we still have a valid token from login response
        // Set minimal user state manually so isAuthenticated is true and user can navigate
        // fetchUser will retry and update this later when navigating to pages
        console.log('Setting minimal user state from login response due to fetchUser failure')
        setUser({
          id: data.userId || 'temp', // Use userId from login response
          email: email, // Use email from login request
          isAdmin: false // Will be updated by fetchUser later
        })
        setProfile(null) // Will be updated by fetchUser later
        setLoading(false)
        console.log('fetchUser failed but token is valid, continuing login with minimal user state...')
      }
      
      // Return hasProfile from the login response
      const hasProfile = data.hasProfile !== undefined ? data.hasProfile : false
      console.log('Login returning hasProfile:', hasProfile)
      return { hasProfile }
    } catch (error: any) {
      console.error('Login error:', error)
      console.error('Error details:', {
        message: error?.message,
        status: error?.status,
        name: error?.name
      })
      // If login API call fails, clean up token
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setLoading(false)
      throw error // Re-throw so login page can show error
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
    console.log('Logging out - clearing all state')
    
    // Cancel any pending requests FIRST
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Clear token FIRST (before state updates)
    localStorage.removeItem('token')
    
    // Reset all state immediately and synchronously
    // Use function form to ensure we're setting from the latest state
    setUser(prev => {
      console.log('Clearing user state, previous:', prev)
      return null
    })
    setProfile(prev => {
      console.log('Clearing profile state, previous:', prev)
      return null
    })
    setLoading(false)
    
    // Force state update to complete by using setTimeout
    // This ensures React has processed the state updates before any new operations
    setTimeout(() => {
      console.log('Logout complete - all state cleared')
      // Verify token is gone
      const token = localStorage.getItem('token')
      if (token) {
        console.error('ERROR: Token still exists after logout!')
        localStorage.removeItem('token')
      }
    }, 0)
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

