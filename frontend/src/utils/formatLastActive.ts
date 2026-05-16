/**
 * Format last-active timestamp for match list / chat (mirrors mobile MatchesScreen).
 * Returns null when hidden (partner has show_active_status off) or activity is older than 7 days.
 */
export function formatLastActive(
  lastActiveAt: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!lastActiveAt) return null;
  const then = new Date(lastActiveAt).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = now.getTime() - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return "Active now";
  if (diffMins < 60) return `Active ${diffMins}m ago`;
  if (diffHours < 24) return `Active ${diffHours}h ago`;
  if (diffDays === 1) return "Active yesterday";
  if (diffDays < 7) return `Active ${diffDays}d ago`;
  return null;
}
