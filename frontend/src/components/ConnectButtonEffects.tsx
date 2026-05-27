import type { ReactNode } from 'react';
import ConnectButtonHeartFireworks from './ConnectButtonHeartFireworks';
import ConnectButtonShimmerEffect from './ConnectButtonShimmerEffect';

type ConnectButtonEffectsProps = {
  children: ReactNode;
  /** When false, shimmer and particles are hidden (e.g. loading/disabled). */
  active?: boolean;
  borderRadius?: number;
  className?: string;
};

/**
 * Wraps Connect CTA content with mobile-parity perimeter shimmer + sparkle particles.
 */
export default function ConnectButtonEffects({
  children,
  active = true,
  borderRadius = 22,
  className = '',
}: ConnectButtonEffectsProps) {
  return (
    <span className={`connect-btn-effects ${className}`.trim()}>
      <ConnectButtonShimmerEffect active={active} borderRadius={borderRadius} />
      <ConnectButtonHeartFireworks active={active} />
      <span className="connect-btn-effects__label">{children}</span>
    </span>
  );
}
