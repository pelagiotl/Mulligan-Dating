import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Landing() {
  // Create floating particles
  const [particles] = useState(() => {
    const particles = []
    for (let i = 0; i < 30; i++) {
      particles.push({
        id: i,
        size: Math.random() * 5 + 3,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: Math.random() * 25 + 20,
        delay: Math.random() * 5
      })
    }
    return particles
  })

  return (
    <div className="landing-enhanced">
      {/* Animated background gradient */}
      <div className="landing-bg-gradient"></div>
      
      {/* Floating particles */}
      <div className="landing-particles">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="landing-particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`
            }}
          />
        ))}
      </div>

      {/* Glowing orbs */}
      <div className="landing-orb landing-orb-1"></div>
      <div className="landing-orb landing-orb-2"></div>
      <div className="landing-orb landing-orb-3"></div>
      <div className="landing-orb landing-orb-4"></div>

      <div className="landing-container-enhanced">
        <header className="landing-header-enhanced">
          <Link to="/" className="landing-logo-enhanced">
            <span className="landing-logo-icon">
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Circular path for rotation */}
                <g className="logo-rotate-group">
                  {/* Heart shape - main element */}
                  <path 
                    d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z" 
                    fill="currentColor"
                    className="logo-heart"
                  />
                  {/* Circular arrow - top right */}
                  <path 
                    d="M30 10C32 10 34 11 35.5 12.5" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    fill="none"
                    className="logo-arrow"
                  />
                  <path 
                    d="M35.5 12.5L32 9" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="logo-arrow"
                  />
                  {/* Circular arrow - bottom left */}
                  <path 
                    d="M18 38C16 38 14 37 12.5 35.5" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    fill="none"
                    className="logo-arrow"
                  />
                  <path 
                    d="M12.5 35.5L16 39" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="logo-arrow"
                  />
                </g>
              </svg>
            </span>
            <span className="landing-logo-text">Mulligan</span>
          </Link>
          <nav className="landing-nav-enhanced">
            <Link to="/login" className="btn-landing btn-landing-ghost">
              Log in
            </Link>
            <Link to="/signup" className="btn-landing btn-landing-primary">
              Get Started
            </Link>
          </nav>
        </header>

        <div className="landing-hero-enhanced">
          <div className="landing-hero-content-enhanced">
            <span className="landing-tagline-enhanced">
              ✨ Where second chances spark first connections!
            </span>

            <h1 className="landing-title-enhanced">
              Find your <span className="landing-title-highlight">perfect match</span> by being authentically you
            </h1>

            <p className="landing-description-enhanced">
              Mulligan is a dating app that celebrates honesty. Share your
              interests, define your dealbreakers, and discover people who truly
              complement your life.
            </p>

            <div className="landing-cta-enhanced">
              <Link to="/signup" className="btn-landing-hero btn-landing-hero-primary">
                <span>Create Your Profile</span>
                <span className="btn-shine"></span>
              </Link>
              <Link to="/login" className="btn-landing-hero btn-landing-hero-secondary">
                I have an account
              </Link>
            </div>
          </div>
        </div>

        <div className="landing-features-enhanced">
          <div className="feature-card-enhanced">
            <div className="feature-icon-enhanced">🎯</div>
            <h3 className="feature-title-enhanced">Be Honest</h3>
            <p className="feature-text-enhanced">
              Share your interests, preferences, and dealbreakers upfront. No
              games, no guessing.
            </p>
          </div>

          <div className="feature-card-enhanced">
            <div className="feature-icon-enhanced">✨</div>
            <h3 className="feature-title-enhanced">Find Your Match</h3>
            <p className="feature-text-enhanced">
              Discover people who share your values and complement your
              lifestyle.
            </p>
          </div>

          <div className="feature-card-enhanced">
            <div className="feature-icon-enhanced">💕</div>
            <h3 className="feature-title-enhanced">Make Real Connections</h3>
            <p className="feature-text-enhanced">
              Skip the small talk and start with what matters most to you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
