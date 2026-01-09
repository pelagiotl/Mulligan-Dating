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
    return <div className="loading-screen">Loading...</div>
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  // Always call hooks at the top level, before any conditional returns
  const { isAuthenticated, isAdmin, loading } = useAuth()
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>
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
    return <div className="loading-screen">Loading...</div>
  }
  
  return !isAuthenticated ? <>{children}</> : <Navigate to="/browse" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/create-profile" element={<PrivateRoute><Layout><CreateProfile /></Layout></PrivateRoute>} />
      <Route path="/browse" element={<PrivateRoute><Layout><Browse /></Layout></PrivateRoute>} />
      <Route path="/matches" element={<PrivateRoute><Layout><Matches /></Layout></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Layout><MyProfile /></Layout></PrivateRoute>} />
      <Route path="/referrals" element={<PrivateRoute><Layout><Referrals /></Layout></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Layout><Settings /></Layout></PrivateRoute>} />
      <Route path="/admin" element={<AdminRoute><Layout><Admin /></Layout></AdminRoute>} />
    </Routes>
  )
}

