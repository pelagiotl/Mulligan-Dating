/**
 * Age gate for store compliance (18+ confirmation).
 * Shown once after phone login until the user confirms they are 18+.
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { clearAgeGateAccepted, setAgeGateAccepted } from '../lib/ageGate';

export default function AgeGate() {
  const navigate = useNavigate();
  const { connectSetupComplete, logout } = useAuth();

  const handleConfirm = () => {
    setAgeGateAccepted();
    navigate(connectSetupComplete ? '/browse' : '/create-profile', { replace: true });
  };

  const handleUnderAge = () => {
    clearAgeGateAccepted();
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-page-enhanced native-app-screen age-gate-page">
      <div className="auth-bg-gradient" aria-hidden="true" />
      <div className="auth-card age-gate-card">
        <h1 className="auth-title">Age requirement</h1>
        <p className="auth-subtitle age-gate-body">
          Mulligan is for people 18 and older. By continuing, you confirm that you are at least 18 years of age.
        </p>
        <button type="button" className="btn btn-primary age-gate-primary" onClick={handleConfirm}>
          I am 18 or older
        </button>
        <button type="button" className="btn btn-ghost age-gate-secondary" onClick={handleUnderAge}>
          I&apos;m not 18 yet
        </button>
      </div>
    </div>
  );
}
