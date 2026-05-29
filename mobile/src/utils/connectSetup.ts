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

export type ProfileActivationMissing = 'name' | 'location';
export type ConnectSetupMissing = ProfileActivationMissing | 'photos';

export function getProfileActivationMissing(profile: ConnectProfileLike): ProfileActivationMissing[] {
  const missing: ProfileActivationMissing[] = [];
  if (!hasConnectDisplayName(profile)) missing.push('name');
  if (!isValidConnectLocation(profileLocationText(profile))) missing.push('location');
  return missing;
}

export function getConnectSetupMissing(
  profile: ConnectProfileLike,
  photoCount: number | null
): ConnectSetupMissing[] {
  const missing: ConnectSetupMissing[] = [...getProfileActivationMissing(profile)];
  if (photoCount === null) return missing;
  if (photoCount < MIN_PHOTOS_TO_CONNECT) missing.push('photos');
  return missing;
}

export function isProfileActivationComplete(profile: ConnectProfileLike): boolean {
  return getProfileActivationMissing(profile).length === 0;
}

export function isConnectSetupComplete(profile: ConnectProfileLike, photoCount: number | null): boolean {
  if (photoCount === null) {
    return isProfileActivationComplete(profile);
  }
  return getConnectSetupMissing(profile, photoCount).length === 0;
}

/** Browse routing after onboarding — name + city/state only. */
export function computeConnectSetupComplete(profile: ConnectProfileLike, photoCount: number): boolean {
  return isProfileActivationComplete(profile);
}

/** Account setup finished and create-profile wizard finished (no in-progress draft). */
export function computeAppConnectReady(
  profile: ConnectProfileLike,
  photoCount: number,
  wizardDraftActive: boolean
): boolean {
  return computeConnectSetupComplete(profile, photoCount) && !wizardDraftActive;
}

export function isAccountActiveFromAuthUser(
  user: { accountActive?: boolean; accountStatus?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (user.accountActive === false) return false;
  if (user.accountStatus === 'onboarding') return false;
  return true;
}

export function deriveAppRegistrationComplete(params: {
  accountActive: boolean;
  profile: ConnectProfileLike;
  photoCount: number;
  wizardDraftActive: boolean;
  serverConnectFlag?: boolean | null;
}): boolean {
  if (!params.accountActive) return false;
  const profileReady =
    params.serverConnectFlag === true ||
    (params.serverConnectFlag !== false && isProfileActivationComplete(params.profile));
  return profileReady && !params.wizardDraftActive;
}

export const CONNECT_PHOTOS_REQUIRED_MESSAGE = `Upload at least ${MIN_PHOTOS_TO_CONNECT} photos on your Profile to start matching with other people.`;

export function connectSetupGapMessage(first: ConnectSetupMissing): string {
  switch (first) {
    case 'name':
      return 'Add your name in Settings (at least 2 characters) before you can Connect.';
    case 'location':
      return 'Add your city and state on your Profile (e.g. Medford, Oregon) before you can Connect.';
    case 'photos':
      return CONNECT_PHOTOS_REQUIRED_MESSAGE;
    default:
      return CONNECT_PHOTOS_REQUIRED_MESSAGE;
  }
}

export function connectSetupGapPrimaryActionLabel(first: ConnectSetupMissing): string {
  return first === 'name' ? 'Open Settings' : 'Open Profile';
}

export type ConnectSetupNavigationTarget = {
  screen: 'Settings' | 'MyProfile';
  params?: { scrollToPhotos?: boolean };
};

export function connectSetupGapNavigationTarget(first: ConnectSetupMissing): ConnectSetupNavigationTarget {
  if (first === 'name') return { screen: 'Settings' };
  return { screen: 'MyProfile', params: first === 'photos' ? { scrollToPhotos: true } : undefined };
}
