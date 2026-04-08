import { useId } from "react";

/** Heart + arrows (rotating) — same branding as iOS Connect landing. */
export default function ConnectLandingMark() {
  const uid = useId().replace(/:/g, "");
  const gradId = `connectHeart-${uid}`;
  const filterId = `connectGlow-${uid}`;

  return (
    <div className="connect-landing__logo-icon" aria-hidden>
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#667eea" />
            <stop offset="45%" stopColor="#764ba2" />
            <stop offset="100%" stopColor="#f093fb" />
          </linearGradient>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="logo-rotate-group">
          <path
            d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
            fill={`url(#${gradId})`}
            className="logo-heart"
            filter={`url(#${filterId})`}
          />
          <g className="logo-arrow-top">
            <circle cx="36" cy="10" r="2" fill="currentColor" opacity="0.9" />
            <path
              d="M30 10L36 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="logo-arrow"
            />
            <path
              d="M33 7L36 10L33 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="logo-arrow"
            />
          </g>
          <g className="logo-arrow-bottom">
            <circle cx="12" cy="38" r="2" fill="currentColor" opacity="0.9" />
            <path
              d="M18 38L12 38"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="logo-arrow"
            />
            <path
              d="M15 35L12 38L15 41"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="logo-arrow"
            />
          </g>
          <circle cx="24" cy="8" r="1.2" fill="currentColor" opacity="0.85" className="logo-sparkle" />
          <circle cx="40" cy="24" r="1.2" fill="currentColor" opacity="0.85" className="logo-sparkle" />
          <circle cx="24" cy="40" r="1.2" fill="currentColor" opacity="0.85" className="logo-sparkle" />
          <circle cx="8" cy="24" r="1.2" fill="currentColor" opacity="0.85" className="logo-sparkle" />
        </g>
      </svg>
    </div>
  );
}
