import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { logout, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="app-layout">
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/browse" className="navbar-logo">
            💘 Mulligan
          </Link>
          
          <ul className="navbar-nav">
            <li>
              <Link 
                to="/browse" 
                className={`navbar-link ${isActive('/browse') ? 'active' : ''}`}
              >
                🔍 Browse
              </Link>
            </li>
            <li>
              <Link 
                to="/matches" 
                className={`navbar-link ${isActive('/matches') ? 'active' : ''}`}
              >
                💌 Matches
              </Link>
            </li>
            <li>
              <Link 
                to="/profile" 
                className={`navbar-link ${isActive('/profile') ? 'active' : ''}`}
              >
                👤 My Profile
              </Link>
            </li>
            <li>
              <Link 
                to="/referrals" 
                className={`navbar-link ${isActive('/referrals') ? 'active' : ''}`}
              >
                🎁 Referrals
              </Link>
            </li>
            <li>
              <Link 
                to="/settings" 
                className={`navbar-link ${isActive('/settings') ? 'active' : ''}`}
              >
                ⚙️ Settings
              </Link>
            </li>
            {isAdmin && (
              <li>
                <Link 
                  to="/admin" 
                  className={`navbar-link ${isActive('/admin') ? 'active' : ''}`}
                >
                  🔐 Admin
                </Link>
              </li>
            )}
            <li>
              <button 
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="navbar-link logout"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Log out
              </button>
            </li>
          </ul>
        </div>
      </nav>
      
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

