import type { ReactNode } from 'react';
import ConnectButtonShimmerEffect from './ConnectButtonShimmerEffect';

type ConnectButtonEffectsProps = {
  children: ReactNode;
  /** When false, shimmer is hidden (e.g. loading/disabled). */
  active?: boolean;
  borderRadius?: number;
  className?: string;
};

/**
 * Wraps Connect CTA content with mobile-parity perimeter shimmer.
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
      <span className="connect-btn-effects__label">{children}</span>
    </span>
  );
}
