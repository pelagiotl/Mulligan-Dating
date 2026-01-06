import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-container">
        <header className="landing-header">
          <div className="landing-logo">💘 Mulligan</div>
          <nav className="landing-nav">
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/signup" className="btn btn-primary">
              Get Started
            </Link>
          </nav>
        </header>

        <div className="landing-hero">
          <div className="landing-hero-content">
            <span className="landing-tagline">
              ✨ Where second chances spark first connections!
            </span>

            <h1 className="landing-title">
              Find your <span>perfect match</span> by being authentically you
            </h1>

            <p className="landing-description">
              Mulligan is a dating app that celebrates honesty. Share your
              interests, define your dealbreakers, and discover people who truly
              complement your life.
            </p>

            <div className="landing-cta">
              <Link to="/signup" className="btn btn-primary btn-lg">
                Create Your Profile
              </Link>
              <Link to="/login" className="btn btn-secondary btn-lg">
                I have an account
              </Link>
            </div>
          </div>
        </div>

        <div className="landing-features">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3 className="feature-title">Be Honest</h3>
            <p className="feature-text">
              Share your interests, preferences, and dealbreakers upfront. No
              games, no guessing.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">✨</div>
            <h3 className="feature-title">Find Your Match</h3>
            <p className="feature-text">
              Discover people who share your values and complement your
              lifestyle.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">💕</div>
            <h3 className="feature-title">Make Real Connections</h3>
            <p className="feature-text">
              Skip the small talk and start with what matters most to you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
