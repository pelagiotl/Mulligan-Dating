import BrandMark from './BrandMark'

interface SessionBootstrapScreenProps {
  title?: string
}

/**
 * Lightweight splash while validating a stored auth token (PWA cold start / post-login).
 * Matches auth-page styling so the shell gradient stays visible instead of a blank screen.
 */
export default function SessionBootstrapScreen({
  title = 'Mulligan',
}: SessionBootstrapScreenProps) {
  return (
    <div
      className="auth-page-enhanced app-boot-screen native-app-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading your session"
    >
      <div className="auth-bg-gradient" aria-hidden />
      <div className="auth-orb auth-orb-1" aria-hidden />
      <div className="auth-orb auth-orb-2" aria-hidden />
      <div className="auth-orb auth-orb-3" aria-hidden />

      <div className="auth-container-enhanced">
        <div className="auth-header-enhanced">
          <div className="auth-logo-enhanced">
            <span className="auth-logo-icon">
              <BrandMark size={48} alt="" />
            </span>
            <span className="auth-logo-text">Mulligan</span>
          </div>
          <h1 className="auth-title-enhanced">{title}</h1>
          <p className="auth-subtitle-enhanced app-boot-screen-subtitle">
            Preparing your experience
          </p>
          <div className="loading-dots" aria-hidden>
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    </div>
  )
}
