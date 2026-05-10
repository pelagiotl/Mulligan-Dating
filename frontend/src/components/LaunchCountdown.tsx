import { useEffect, useState } from "react";

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

  if (state.live) {
    return (
      <section className="launch-countdown launch-countdown--live" aria-labelledby="launch-countdown-heading">
        <h2 id="launch-countdown-heading" className="launch-countdown__heading">
          June 6 launch
        </h2>
        <p className="launch-countdown__live-msg">We're live — welcome to Mulligan.</p>
      </section>
    );
  }

  const { days, hours, minutes, seconds } = state;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
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
        aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds remaining`}
      >
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{days}</span>
          <span className="launch-countdown__unit">Days</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{pad(hours)}</span>
          <span className="launch-countdown__unit">Hours</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{pad(minutes)}</span>
          <span className="launch-countdown__unit">Minutes</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{pad(seconds)}</span>
          <span className="launch-countdown__unit">Seconds</span>
        </div>
      </div>
    </section>
  );
}
