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
      const data: any = await api.get('/auth/me')
      console.log('User data from /auth/me:', data.user) // Debug log
      setUser({
        id: data.user.id,
        email: data.user.email,
        isAdmin: data.user.isAdmin || false
      })
      console.log('isAdmin set to:', data.user.isAdmin || false) // Debug log
      setProfile(data.profile)
    } catch (error) {
      console.error('Failed to fetch user:', error)
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
      localStorage.setItem('token', data.token)
      // Reset loading state before fetching user
      setLoading(true)
      await fetchUser()
      return { hasProfile: data.hasProfile }
    } catch (error) {
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
    localStorage.removeItem('token')
    setUser(null)
    setProfile(null)
    setLoading(false) // Reset loading state on logout
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

