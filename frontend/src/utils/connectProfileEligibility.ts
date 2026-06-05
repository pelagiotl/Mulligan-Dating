/** Mirrors backend `connectRequirements.ts` for routing and post-login redirects. */

import { CONNECT_PHOTOS_REQUIRED_MESSAGE } from "../constants/connectPhotoCopy";

export const MIN_PHOTOS_TO_CONNECT = 1;

export function minPhotosToConnectLabel(count = MIN_PHOTOS_TO_CONNECT): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

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

function rowAge(row: unknown): number | null {
  if (row == null || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const v = o.age ?? o.profile_age;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowGender(row: unknown): string {
  if (row == null || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  const v = o.gender;
  return typeof v === "string" ? v : "";
}

export type ProfileActivationGap = "name" | "location" | "age" | "gender";
export type ConnectSetupGap = ProfileActivationGap | "photos";

export function getProfileActivationGaps(profileRow: unknown): ProfileActivationGap[] {
  const gaps: ProfileActivationGap[] = [];
  if (!profileRow || typeof profileRow !== "object") {
    return ["name", "location", "gender"];
  }
  if (!hasConnectDisplayName(rowDisplayName(profileRow))) gaps.push("name");
  if (!isValidConnectLocation(rowLocation(profileRow))) gaps.push("location");
  const gender = rowGender(profileRow).trim();
  if (!gender || !["Man", "Woman", "Other"].includes(gender)) gaps.push("gender");
  return gaps;
}

export function getConnectSetupGaps(profileRow: unknown, photoCount: number): ConnectSetupGap[] {
  const gaps: ConnectSetupGap[] = [...getProfileActivationGaps(profileRow)];
  const age = rowAge(profileRow);
  if (age == null || age < 18 || age > 120) gaps.push("age");
  if (photoCount < MIN_PHOTOS_TO_CONNECT) gaps.push("photos");
  return gaps;
}

export function formatProfileActivationGapMessage(gaps: ProfileActivationGap[]): string {
  if (gaps.length === 0) {
    return "Profile not ready yet. Tap Complete Profile again.";
  }
  const parts: string[] = [];
  if (gaps.includes("name")) parts.push("your name (at least 2 characters)");
  if (gaps.includes("location")) {
    parts.push("city and state on your profile (e.g. Medford, Oregon)");
  }
  if (gaps.includes("age")) parts.push("your age (18 or older)");
  if (gaps.includes("gender")) parts.push("your gender");
  return `Still missing on the server: ${parts.join(", ")}. Check your connection and try again.`;
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
  if (gaps.includes("age")) parts.push("your age (18 or older)");
  if (gaps.includes("gender")) parts.push("your gender");
  if (gaps.includes("photos")) {
    parts.push(`at least ${minPhotosToConnectLabel()} saved on the server`);
  }
  return `Still missing on the server: ${parts.join(", ")}. Check your connection and try again.`;
}

export function computeProfileActivationComplete(profileRow: unknown): boolean {
  return getProfileActivationGaps(profileRow).length === 0;
}

export function computeConnectSetupComplete(profileRow: unknown, photoCount: number): boolean {
  return getConnectSetupGaps(profileRow, photoCount).length === 0;
}

/** Account setup finished (name + location) and create-profile wizard finished (no in-progress draft). */
export function computeAppConnectReady(
  profileRow: unknown,
  photoCount: number,
  wizardDraftActive: boolean
): boolean {
  return computeProfileActivationComplete(profileRow) && !wizardDraftActive;
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
 * User may use browse after onboarding: account activated + name/location + wizard finished.
 * Photos are required later when tapping Connect to match.
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
    (params.serverConnectFlag !== false && computeProfileActivationComplete(params.profileRow));
  return profileReady && !params.wizardDraftActive;
}

export { CONNECT_PHOTOS_REQUIRED_MESSAGE } from "../constants/connectPhotoCopy";

/** Friendly copy when the user taps Connect before profile setup is complete. */
export function connectSetupGapUserMessage(gap: ConnectSetupGap): string {
  switch (gap) {
    case "name":
      return "Add your name in Settings (at least 2 characters) before you can Connect.";
    case "location":
      return "Add your city and state on your Profile (e.g. Medford, Oregon) before you can Connect.";
    case "age":
      return "Add your age on your Profile before you can Connect.";
    case "gender":
      return "Add your gender on your Profile before you can Connect.";
    case "photos":
      return CONNECT_PHOTOS_REQUIRED_MESSAGE;
    default:
      return "Complete your profile before you can Connect.";
  }
}

export function connectSetupGapPrimaryLabel(gap: ConnectSetupGap): string {
  return gap === "name" ? "Open Settings" : "Open Profile";
}

export function connectSetupGapPath(gap: ConnectSetupGap): string {
  if (gap === "name") return "/settings";
  if (gap === "age") return "/profile#my-profile-age";
  return "/profile";
}

export function connectSetupGapModalTitle(gap: ConnectSetupGap): string {
  switch (gap) {
    case "age":
      return "Add your age";
    case "gender":
      return "Add your gender";
    case "location":
      return "Add your location";
    case "name":
      return "Add your name";
    default:
      return "Finish your profile";
  }
}

export function connectSetupGapModalEmoji(gap: ConnectSetupGap): string {
  switch (gap) {
    case "age":
      return "🎂";
    case "gender":
      return "⚧️";
    case "location":
      return "📍";
    case "name":
      return "👋";
    default:
      return "✨";
  }
}
