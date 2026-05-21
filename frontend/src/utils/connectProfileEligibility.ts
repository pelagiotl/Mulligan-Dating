/** Mirrors backend `connectRequirements.ts` for routing and post-login redirects. */

export const MIN_PHOTOS_TO_CONNECT = 3;

export function hasConnectDisplayName(displayName: string | null | undefined): boolean {
  return typeof displayName === "string" && displayName.trim().length >= 2;
}

/** Same rule as profile Zod: city and state separated by a comma. */
export function isValidConnectLocation(location: string | null | undefined): boolean {
  if (location == null || typeof location !== "string") return false;
  const t = location.trim();
  const i = t.indexOf(",");
  if (i === -1) return false;
  return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
}

function rowDisplayName(row: unknown): string {
  if (row == null || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  const v = o.displayName ?? o.display_name;
  return typeof v === "string" ? v : "";
}

function rowLocation(row: unknown): string {
  if (row == null || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  const v = o.location;
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

export function computeConnectSetupComplete(profileRow: unknown, photoCount: number): boolean {
  if (!profileRow || typeof profileRow !== "object") return false;
  const name = rowDisplayName(profileRow);
  const loc = rowLocation(profileRow);
  return (
    hasConnectDisplayName(name) &&
    isValidConnectLocation(loc) &&
    photoCount >= MIN_PHOTOS_TO_CONNECT
  );
}

/** Connect rules met and create-profile wizard finished (no in-progress draft). */
export function computeAppConnectReady(
  profileRow: unknown,
  photoCount: number,
  wizardDraftActive: boolean
): boolean {
  return computeConnectSetupComplete(profileRow, photoCount) && !wizardDraftActive;
}
