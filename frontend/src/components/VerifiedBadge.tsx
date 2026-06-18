import './VerifiedBadge.css';

type Props = {
  verified?: boolean;
  size?: number;
  className?: string;
};

/** Admin-granted Mulligan verification — not automated photo verification. */
export default function VerifiedBadge({ verified, size = 18, className = '' }: Props) {
  if (!verified) return null;
  return (
    <span
      className={`mulligan-verified-badge ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.62) }}
      title="Verified by Mulligan"
      aria-label="Verified by Mulligan"
      role="img"
    >
      ✓
    </span>
  );
}
