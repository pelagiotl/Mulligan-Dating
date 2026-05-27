import type { ReactNode } from 'react';

type ConnectButtonEffectsProps = {
  children: ReactNode;
  /** Kept for API compatibility with existing call sites. */
  active?: boolean;
  borderRadius?: number;
  className?: string;
};

/**
 * Web CTA wrapper: intentionally static (no shimmer/particle animation).
 */
export default function ConnectButtonEffects({
  children,
  active = true,
  borderRadius = 22,
  className = '',
}: ConnectButtonEffectsProps) {
  void active;
  void borderRadius;
  return (
    <span className={`connect-btn-effects ${className}`.trim()}>
      <span className="connect-btn-effects__label">{children}</span>
    </span>
  );
}
