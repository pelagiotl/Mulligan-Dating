import type { ReactNode } from 'react';
import ConnectButtonHeartFireworks from './ConnectButtonHeartFireworks';
import ConnectButtonShimmerEffect from './ConnectButtonShimmerEffect';

type ConnectButtonEffectsProps = {
  children: ReactNode;
  /** When false, perimeter shimmer and heart particles are hidden. */
  active?: boolean;
  borderRadius?: number;
  className?: string;
  /** Floating hearts that fall onto the CTA (mobile parity). */
  showHearts?: boolean;
};

/**
 * Web Connect CTA: perimeter shimmer + floating heart/sparkle particles.
 * Hearts render in a sibling overlay so parent `overflow: hidden` does not clip them.
 */
export default function ConnectButtonEffects({
  children,
  active = true,
  borderRadius = 22,
  className = '',
  showHearts = true,
}: ConnectButtonEffectsProps) {
  const heartsOn = active && showHearts;

  return (
    <span className={`connect-btn-effects-wrap ${className}`.trim()}>
      <span className="connect-btn-effects">
        <ConnectButtonShimmerEffect active={active} borderRadius={borderRadius} />
        <span className="connect-btn-effects__label">{children}</span>
      </span>
      {heartsOn ? (
        <span className="connect-btn-effects-wrap__hearts" aria-hidden>
          <ConnectButtonHeartFireworks active />
        </span>
      ) : null}
    </span>
  );
}
