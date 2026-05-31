import { CONNECT_SHOOTING_HEARTS } from '../constants/connectButtonEffects';

type ConnectButtonHeartFireworksProps = {
  active?: boolean;
};

/** Feature-aligned particles (✨ 🎯 💝) that arc onto the Connect CTA from above (no center burst on web). */
export default function ConnectButtonHeartFireworks({
  active = true,
}: ConnectButtonHeartFireworksProps) {
  if (!active) return null;

  return (
    <div className="connect-btn-hearts" aria-hidden>
      {CONNECT_SHOOTING_HEARTS.map((spec, i) => (
        <span
          key={`shoot-${spec.emoji}-${spec.left}-${i}`}
          className="connect-btn-hearts__shoot"
          style={{
            left: spec.left,
            fontSize: spec.sizePx,
            ['--shoot-delay' as string]: `${spec.delayMs}ms`,
            ['--shoot-dur' as string]: `${spec.durationMs}ms`,
            ['--shoot-y0' as string]: `${spec.startY}px`,
            ['--shoot-y1' as string]: `${spec.endY}px`,
            ['--shoot-dx' as string]: `${spec.driftX}px`,
            ['--shoot-rot0' as string]: `${spec.startRotationDeg}deg`,
            ['--shoot-rot1' as string]: `${spec.endRotationDeg}deg`,
          }}
        >
          {spec.emoji}
        </span>
      ))}
    </div>
  );
}
