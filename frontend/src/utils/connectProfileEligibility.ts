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

export type ConnectSetupGap = "name" | "location" | "photos";

export function getConnectSetupGaps(profileRow: unknown, photoCount: number): ConnectSetupGap[] {
  const gaps: ConnectSetupGap[] = [];
  if (!profileRow || typeof profileRow !== "object") {
    return ["name", "location", "photos"];
  }
  if (!hasConnectDisplayName(rowDisplayName(profileRow))) gaps.push("name");
  if (!isValidConnectLocation(rowLocation(profileRow))) gaps.push("location");
  if (photoCount < MIN_PHOTOS_TO_CONNECT) gaps.push("photos");
  return gaps;
}

export function formatConnectSetupGapMessage(gaps: ConnectSetupGap[]): string {
  if (gaps.length === 0) {
    return "Profile not ready yet. Tap Complete Profile again.";
  }
  const parts: string[] = [];
  if (gaps.includes("name")) parts.push("your name (at least 2 characters)");
  if (gaps.includes("location")) {
    parts.push("city and state on your profile (e.g. Medford, Oregon)");
  }
  if (gaps.includes("photos")) {
    parts.push(`at least ${MIN_PHOTOS_TO_CONNECT} photos saved on the server`);
  }
  return `Still missing on the server: ${parts.join(", ")}. Check your connection and try again.`;
}

export function computeConnectSetupComplete(profileRow: unknown, photoCount: number): boolean {
  return getConnectSetupGaps(profileRow, photoCount).length === 0;
}

/** Connect rules met and create-profile wizard finished (no in-progress draft). */
export function computeAppConnectReady(
  profileRow: unknown,
  photoCount: number,
  wizardDraftActive: boolean
): boolean {
  return computeConnectSetupComplete(profileRow, photoCount) && !wizardDraftActive;
}

export function isAccountActiveFromAuthUser(
  user: { accountActive?: boolean; accountStatus?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (user.accountActive === false) return false;
  if (user.accountStatus === "onboarding") return false;
  return true;
}

/**
 * User may use Connect/browse: account activated + profile requirements + wizard finished.
 * Never treat mid-wizard server saves (photos uploaded) as "done" while account is still onboarding.
 */
export function deriveAppRegistrationComplete(params: {
  accountActive: boolean;
  profileRow: unknown;
  photoCount: number;
  wizardDraftActive: boolean;
  serverConnectFlag?: boolean | null;
}): boolean {
  if (!params.accountActive) return false;
  const profileReady =
    params.serverConnectFlag === true ||
    (params.serverConnectFlag !== false &&
      computeConnectSetupComplete(params.profileRow, params.photoCount));
  return profileReady && !params.wizardDraftActive;
}
