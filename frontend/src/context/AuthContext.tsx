import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
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
      // Verify token exists before making request
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('No authentication token found')
      }
      
      console.log('Fetching user data with token:', token.substring(0, 20) + '...')
      const data: any = await api.get('/auth/me')
      
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
      const data: any = await api.post('/auth/login', { email, password })
      
      // Ensure token is set before fetching user
      if (!data.token) {
        throw new Error('No token received from server')
      }
      
      localStorage.setItem('token', data.token)
      
      // Small delay to ensure token is persisted and available
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Reset loading state before fetching user
      setLoading(true)
      
      // Verify token is available before making request
      const tokenCheck = localStorage.getItem('token')
      if (!tokenCheck) {
        throw new Error('Token was not properly saved')
      }
      
      await fetchUser()
      return { hasProfile: data.hasProfile }
    } catch (error) {
      console.error('Login error:', error)
      // If fetchUser fails, clean up token
      localStorage.removeItem('token')
      setUser(null)
      setProfile(null)
      setLoading(false)
      throw error // Re-throw so login page can show error
    }
  }

  const signup = async (email: string, password: string, referralCode?: string) => {
    const data: any = await api.post('/auth/signup', { email, password, referralCode })
    localStorage.setItem('token', data.token)
    setUser({ id: data.userId, email })
  }

  const logout = () => {
    console.log('Logging out - clearing all state')
    // Clear token first
    localStorage.removeItem('token')
    // Reset all state synchronously
    setUser(null)
    setProfile(null)
    setLoading(false)
    // Force a small delay to ensure state is cleared before any new operations
    // This helps prevent race conditions with pending requests
    setTimeout(() => {
      console.log('Logout complete - state cleared')
    }, 0)
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

