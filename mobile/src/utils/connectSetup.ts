export const MIN_PHOTOS_TO_CONNECT = 3;

/** Auth/me and browse payloads may use displayName and/or display_name. */
export type ConnectProfileLike = {
  displayName?: string;
  display_name?: string;
  location?: string | null;
} | null;

function displayNameFromProfile(profile: ConnectProfileLike): string {
  if (!profile) return '';
  return (profile.displayName ?? profile.display_name ?? '').trim();
}

export function profileLocationText(profile: ConnectProfileLike): string | null {
  if (!profile) return null;
  const loc = profile.location;
  return typeof loc === 'string' ? loc : null;
}

/** City and comma state, same rule as backend / profile form. */
export function isValidConnectLocation(location: string | null | undefined): boolean {
  if (location == null || typeof location !== 'string') return false;
  const t = location.trim();
  const i = t.indexOf(',');
  if (i === -1) return false;
  return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
}

export function hasConnectDisplayName(profile: ConnectProfileLike): boolean {
  return displayNameFromProfile(profile).length >= 2;
}

export type ConnectSetupMissing = 'name' | 'location' | 'photos';

export function getConnectSetupMissing(
  profile: ConnectProfileLike,
  photoCount: number | null
): ConnectSetupMissing[] {
  const missing: ConnectSetupMissing[] = [];
  if (photoCount === null) return missing;
  if (!hasConnectDisplayName(profile)) missing.push('name');
  if (!isValidConnectLocation(profileLocationText(profile))) missing.push('location');
  if (photoCount < MIN_PHOTOS_TO_CONNECT) missing.push('photos');
  return missing;
}

export function isConnectSetupComplete(profile: ConnectProfileLike, photoCount: number | null): boolean {
  if (photoCount === null) return false;
  return getConnectSetupMissing(profile, photoCount).length === 0;
}

/** Same gate as web `computeConnectSetupComplete` — name, city+state, min photos. */
export function computeConnectSetupComplete(profile: ConnectProfileLike, photoCount: number): boolean {
  return isConnectSetupComplete(profile, photoCount);
}
