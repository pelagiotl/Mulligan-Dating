import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  LAUNCH_FIREWORK_BURSTS,
  LAUNCH_FLOATERS,
  LAUNCH_ROCKETS,
  buildBurstParticles,
} from "../constants/launchGoLiveEffects";
import { playLaunchGoLiveSound } from "../utils/launchGoLiveSound";
import "./LaunchGoLiveCelebration.css";

type Props = {
  onClose: () => void;
};

export default function LaunchGoLiveCelebration({ onClose }: Props) {
  const bursts = useMemo(
    () =>
      LAUNCH_FIREWORK_BURSTS.map((burst) => ({
        ...burst,
        particles: buildBurstParticles(burst.particleCount, burst.hues),
      })),
    []
  );

  useEffect(() => {
    playLaunchGoLiveSound();
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const content = (
    <div
      className="launch-go-live"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-go-live-title"
    >
      <div className="launch-go-live__backdrop" aria-hidden />

      <div className="launch-go-live__fx" aria-hidden>
        {LAUNCH_ROCKETS.map((rocket, i) => (
          <div
            key={`rocket-${i}`}
            className="launch-go-live__rocket-wrap"
            style={{
              left: `${rocket.leftPct}%`,
              ["--rocket-delay" as string]: `${rocket.delayMs}ms`,
              ["--rocket-rise" as string]: `${rocket.explodeAtPct}vh`,
            }}
          >
            <span className="launch-go-live__rocket-trail" />
            <span className="launch-go-live__rocket">🚀</span>
            <span className="launch-go-live__rocket-boom">💥</span>
          </div>
        ))}

        {bursts.map((burst, bi) => (
          <div
            key={`burst-${bi}`}
            className="launch-go-live__burst"
            style={{
              left: `${burst.leftPct}%`,
              top: `${burst.topPct}%`,
              ["--burst-delay" as string]: `${burst.delayMs}ms`,
            }}
          >
            {burst.particles.map((p, pi) => (
              <span
                key={`spark-${bi}-${pi}`}
                className="launch-go-live__spark"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  color: p.color,
                  ["--tx" as string]: `${p.tx}px`,
                  ["--ty" as string]: `${p.ty}px`,
                  ["--spark-delay" as string]: `${p.delayMs}ms`,
                }}
              />
            ))}
            <span className="launch-go-live__burst-emoji">🎆</span>
          </div>
        ))}

        {LAUNCH_FLOATERS.map((f, i) => (
          <span
            key={`floater-${i}`}
            className="launch-go-live__floater"
            style={{
              left: `${f.leftPct}%`,
              ["--floater-delay" as string]: `${f.delayMs}ms`,
              ["--floater-dur" as string]: `${f.durationMs}ms`,
              ["--floater-size" as string]: `${f.sizePx}px`,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="launch-go-live__card">
        <span className="launch-go-live__card-glow" aria-hidden />
        <div className="launch-go-live__hero" aria-hidden>
          <span className="launch-go-live__hero-emoji launch-go-live__hero-emoji--rocket">🚀</span>
          <span className="launch-go-live__hero-emoji launch-go-live__hero-emoji--boom">💥</span>
          <span className="launch-go-live__hero-emoji launch-go-live__hero-emoji--fw">🎆</span>
        </div>
        <h2 id="launch-go-live-title" className="launch-go-live__title">
          We&apos;re Live!
        </h2>
        <p className="launch-go-live__subtitle">
          Mulligan just launched — your next match is waiting.
        </p>
        <button type="button" className="launch-go-live__cta" onClick={onClose}>
          Let&apos;s go!
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
