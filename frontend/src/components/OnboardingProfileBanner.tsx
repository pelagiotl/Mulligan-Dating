import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './OnboardingProfileBanner.css';

/**
 * Shown when the user is signed in but has not finished account setup (Complete Profile).
 * Hidden on the create-profile wizard itself.
 */
export default function OnboardingProfileBanner() {
  const { isAuthenticated, connectSetupComplete, loading } = useAuth();
  const location = useLocation();
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';

  if (loading || !isAuthenticated || connectSetupComplete) return null;
  if (path === '/create-profile') return null;

  return (
    <div className="onboarding-profile-banner" role="status">
      <div className="onboarding-profile-banner-inner">
        <p className="onboarding-profile-banner-text">
          <strong>Finish your profile</strong> — add your name, location, and a photo (if you
          haven&apos;t already), then tap Complete Profile.
        </p>
        <Link to="/create-profile" className="onboarding-profile-banner-cta">
          Complete Profile
        </Link>
      </div>
    </div>
  );
}
