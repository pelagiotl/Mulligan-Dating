import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConnectButtonEffects from "../components/ConnectButtonEffects";
import ConnectLandingMark from "../components/ConnectLandingMark";
import LaunchCountdown from "../components/LaunchCountdown";
import WebTokenPurchase from "../components/WebTokenPurchase";
import ConnectLandingTagline from "../components/ConnectLandingTagline";

/**
 * Public home — same Connect landing card as iOS BrowseScreen (Connect tab).
 * In-app tabs match native: Connect, Matches.
 */
export default function Landing() {
  const { isAuthenticated, loading: authLoading } = useAuth();

  return (
    <div className="landing-public-root native-app-screen">
      <LaunchCountdown />
      <header className="landing-public-nav">
        <Link to="/" className="landing-public-nav__brand">
          Mulligan
        </Link>
        <div className="landing-public-nav__actions">
          <Link to="/login" className="landing-public-nav__link">
            Log in
          </Link>
          <Link to="/signup" className="landing-public-nav__cta">
            Get started
          </Link>
        </div>
      </header>

      <main className="landing-public-main">
        <div className="connect-landing">
          <div className="connect-landing__card">
            <div className="connect-landing__logo-row">
              <ConnectLandingMark />
              <span className="connect-landing__brand">Mulligan</span>
            </div>

            <h1 className="connect-landing__title">Discover People</h1>
            <ConnectLandingTagline />

            <div className="connect-landing__features">
              <div className="connect-landing__feature">
                <span className="connect-landing__feature-emoji">✨</span>
                <span className="connect-landing__feature-text">
                  <span className="connect-landing__feature-line">Quality</span>
                  <span className="connect-landing__feature-line">Matches</span>
                </span>
              </div>
              <div className="connect-landing__feature">
                <span className="connect-landing__feature-emoji">🎯</span>
                <span className="connect-landing__feature-text">
                  <span className="connect-landing__feature-line">Shared</span>
                  <span className="connect-landing__feature-line">Interests</span>
                </span>
              </div>
              <div className="connect-landing__feature">
                <span className="connect-landing__feature-emoji">💝</span>
                <span className="connect-landing__feature-text">
                  <span className="connect-landing__feature-line">Meaningful</span>
                  <span className="connect-landing__feature-line">Connections</span>
                </span>
              </div>
            </div>

            <Link to="/signup" className="connect-landing__cta connect-landing__cta--effects">
              <ConnectButtonEffects active borderRadius={18}>
                Get started
              </ConnectButtonEffects>
            </Link>
            <Link to="/login" className="connect-landing__subcta">
              I already have an account
            </Link>

            <p className="connect-landing__hint">⛳ Use a Mulligan</p>

            {!authLoading && !isAuthenticated && (
              <p className="landing-token-chill-guest">
                Already playing?{" "}
                <Link to="/login" className="landing-token-chill-guest__link">
                  Log in
                </Link>{" "}
                to top up Mulligan tokens — no pressure.
              </p>
            )}

            {!authLoading && isAuthenticated && <WebTokenPurchase variant="landing" />}

            <p className="connect-landing__legal">
              By continuing, you agree to our{" "}
              <Link to="/terms">Terms</Link> and{" "}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
