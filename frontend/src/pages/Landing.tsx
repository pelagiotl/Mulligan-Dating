import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import BrandMark from "../components/BrandMark";

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

  // Refs for feature cards to animate automatically
  const featureCardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Automatically animate cards in one at a time on page load
  useEffect(() => {
    // Small delay to ensure refs are set and page is ready
    const initialDelay = 500 // Start animations 500ms after page load
    
    // Animate each card with staggered delays
    featureCardRefs.current.forEach((card, index) => {
      if (card) {
        const delay = initialDelay + (index * 400) // 400ms between each card
        setTimeout(() => {
          card.classList.add('feature-card-visible')
        }, delay)
      }
    })
  }, [])

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
              <BrandMark size={40} alt="" />
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
              ✨ Real people. Real hangs. Your vibe.
            </span>

            <h1 className="landing-title-enhanced">
              The anti-swipe app for <span className="landing-title-highlight">real-life hangs</span>
            </h1>

            <p className="landing-description-enhanced">
              Mulligan helps you meet people nearby who share your interests. Be
              upfront about what you’re into, then connect and chat when the vibe
              is right.
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
          <div 
            ref={(el) => (featureCardRefs.current[0] = el)}
            className="feature-card-enhanced"
          >
            <div className="feature-icon-enhanced">🎯</div>
            <h3 className="feature-title-enhanced">Be Honest</h3>
            <p className="feature-text-enhanced">
              Share your interests and what you’re looking for upfront—no games,
              no guessing.
            </p>
          </div>

          <div 
            ref={(el) => (featureCardRefs.current[1] = el)}
            className="feature-card-enhanced"
          >
            <div className="feature-icon-enhanced">✨</div>
            <h3 className="feature-title-enhanced">Connect on interests</h3>
            <p className="feature-text-enhanced">
              We surface people who overlap with your hobbies and passions—not
              just a profile photo.
            </p>
          </div>

          <div 
            ref={(el) => (featureCardRefs.current[2] = el)}
            className="feature-card-enhanced"
          >
            <div className="feature-icon-enhanced">🙌</div>
            <h3 className="feature-title-enhanced">Turn chats into plans</h3>
            <p className="feature-text-enhanced">
              Message in the app, then take it offline when you’re ready for a
              real hang or activity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
