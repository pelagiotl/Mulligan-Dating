/** City and state required for profile location (e.g. "Medford, Oregon"). */
export function hasCityAndState(location: string): boolean {
  const t = location.trim();
  const i = t.indexOf(",");
  if (i === -1) return false;
  return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
}
