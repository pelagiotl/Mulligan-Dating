import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Local midnight at the start of launch day (June 6, 2026). */
const LAUNCH_MS = new Date(2026, 5, 6, 0, 0, 0, 0).getTime();

type Remaining =
  | { live: true; days: 0; hours: 0; minutes: 0; seconds: 0 }
  | { live: false; days: number; hours: number; minutes: number; seconds: number };

function computeRemaining(): Remaining {
  const diff = LAUNCH_MS - Date.now();
  if (diff <= 0) {
    return { live: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    live: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function LaunchCountdown() {
  const [state, setState] = useState<Remaining>(() => computeRemaining());

  useEffect(() => {
    const id = window.setInterval(() => setState(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  const inner = state.live ? (
    <section
      className="launch-countdown launch-countdown--live"
      aria-labelledby="launch-countdown-heading"
    >
      <h2 id="launch-countdown-heading" className="launch-countdown__heading">
        June 6 launch
      </h2>
      <p className="launch-countdown__live-msg">We&apos;re live — welcome to Mulligan.</p>
    </section>
  ) : (
    <section className="launch-countdown" aria-labelledby="launch-countdown-heading">
      <h2 id="launch-countdown-heading" className="launch-countdown__heading">
        June 6 launch
      </h2>
      <p className="launch-countdown__sub">Time until launch</p>
      <div
        className="launch-countdown__grid"
        role="timer"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${state.days} days, ${state.hours} hours, ${state.minutes} minutes, ${state.seconds} seconds remaining`}
      >
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{state.days}</span>
          <span className="launch-countdown__unit">Days</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{String(state.hours).padStart(2, "0")}</span>
          <span className="launch-countdown__unit">Hours</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{String(state.minutes).padStart(2, "0")}</span>
          <span className="launch-countdown__unit">Minutes</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{String(state.seconds).padStart(2, "0")}</span>
          <span className="launch-countdown__unit">Seconds</span>
        </div>
      </div>
    </section>
  );

  const bubble = (
    <div className="launch-countdown-bubble">
      <span className="launch-countdown-bubble__pin" aria-hidden />
      {inner}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(bubble, document.body);
}
