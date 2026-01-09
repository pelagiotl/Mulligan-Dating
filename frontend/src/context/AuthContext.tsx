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
  signup: (email: string, password: string, referralCode?: string) => Promise<void>
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
      fetchUser()
    } else {
      setLoading(false)
    }
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
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      throw error // Re-throw so caller can handle it
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
      await fetchUser()
      console.log('Login complete, user data fetched')
      return { hasProfile: data.hasProfile }
    } catch (error: any) {
      console.error('Login error:', error)
      console.error('Error details:', {
        message: error?.message,
        status: error?.status,
        name: error?.name
      })
      // If fetchUser fails, clean up token
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setLoading(false)
      throw error // Re-throw so login page can show error
    }
  }

  const signup = async (email: string, password: string, referralCode?: string, acceptTerms?: boolean, acceptPrivacy?: boolean) => {
    const data: any = await api.post('/auth/signup', { email, password, referralCode })
    localStorage.setItem('token', data.token)
    setUser({ id: data.userId, email })
  }

  const logout = () => {
    console.log('Logging out - clearing all state')
    
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Clear token first
    localStorage.removeItem('token')
    
    // Reset all state synchronously
    setUser(null)
    setProfile(null)
    setLoading(false)
    
    console.log('Logout complete - state cleared')
  }

  const refreshProfile = async () => {
    try {
      const data: any = await api.get('/profile')
      setProfile(data.profile)
    } catch {
      // Profile might not exist yet
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

