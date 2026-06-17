export const MIN_PHOTOS_TO_CONNECT = 1;

export function minPhotosToConnectLabel(count = MIN_PHOTOS_TO_CONNECT): string {
  return count === 1 ? '1 photo' : `${count} photos`;
}

/** Auth/me and browse payloads may use displayName and/or display_name. */
export type ConnectProfileLike = {
  displayName?: string;
  display_name?: string;
  location?: string | null;
  age?: number | null;
  gender?: string | null;
  intro_video_url?: string | null;
  introVideoUrl?: string | null;
} | null;

const VALID_PROFILE_GENDERS = ['Man', 'Woman', 'Other'] as const;

function hasValidProfileAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && !Number.isNaN(age) && age >= 18 && age <= 120;
}

function hasValidProfileGender(gender: string | null | undefined): boolean {
  const g = (gender ?? '').trim();
  return (VALID_PROFILE_GENDERS as readonly string[]).includes(g);
}

function profileIntroVideoUrl(profile: ConnectProfileLike): string | null {
  if (!profile) return null;
  const url = profile.intro_video_url ?? profile.introVideoUrl ?? null;
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
}

export function hasIntroVideo(profile: ConnectProfileLike): boolean {
  return profileIntroVideoUrl(profile) != null;
}

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

export type ProfileActivationMissing = 'name' | 'location' | 'introVideo';
export type ConnectSetupMissing = ProfileActivationMissing | 'age' | 'gender' | 'photos';

export function getProfileActivationMissing(profile: ConnectProfileLike): ProfileActivationMissing[] {
  const missing: ProfileActivationMissing[] = [];
  if (!hasConnectDisplayName(profile)) missing.push('name');
  if (!isValidConnectLocation(profileLocationText(profile))) missing.push('location');
  if (!hasIntroVideo(profile)) missing.push('introVideo');
  return missing;
}

export function getConnectSetupMissing(
  profile: ConnectProfileLike,
  photoCount: number | null,
): ConnectSetupMissing[] {
  const missing: ConnectSetupMissing[] = [...getProfileActivationMissing(profile)];
  if (!hasValidProfileAge(profile?.age ?? null)) missing.push('age');
  if (!hasValidProfileGender(profile?.gender ?? null)) missing.push('gender');
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

/** Browse routing after onboarding — name, location, intro video. */
export function computeConnectSetupComplete(profile: ConnectProfileLike, photoCount: number): boolean {
  return isProfileActivationComplete(profile);
}

/** Account setup finished and create-profile wizard finished (no in-progress draft). */
export function computeAppConnectReady(
  profile: ConnectProfileLike,
  photoCount: number,
  wizardDraftActive: boolean,
): boolean {
  return computeConnectSetupComplete(profile, photoCount) && !wizardDraftActive;
}

export function isAccountActiveFromAuthUser(
  user: { accountActive?: boolean; accountStatus?: string } | null | undefined,
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

import { CONNECT_PHOTOS_REQUIRED_MESSAGE } from '../constants/connectPhotoCopy';

export { CONNECT_PHOTOS_REQUIRED_MESSAGE };

export function connectSetupGapMessage(first: ConnectSetupMissing): string {
  switch (first) {
    case 'name':
      return 'Add your name in Settings (at least 2 characters) before you can Connect.';
    case 'location':
      return 'Add your city and state on your Profile (e.g. Medford, Oregon) before you can Connect.';
    case 'age':
      return 'Add your age on your Profile before you can Connect.';
    case 'gender':
      return 'Add your gender on your Profile before you can Connect.';
    case 'introVideo':
      return 'Record your 10-second intro video before you can Connect.';
    case 'photos':
      return CONNECT_PHOTOS_REQUIRED_MESSAGE;
    default:
      return CONNECT_PHOTOS_REQUIRED_MESSAGE;
  }
}

export function connectSetupGapPrimaryActionLabel(first: ConnectSetupMissing): string {
  if (first === 'name') return 'Open Settings';
  if (first === 'introVideo') return 'Record intro';
  return 'Open Profile';
}

export function connectSetupGapModalTitle(gap: ConnectSetupMissing): string {
  switch (gap) {
    case 'age':
      return 'Add your age';
    case 'gender':
      return 'Add your gender';
    case 'location':
      return 'Add your location';
    case 'name':
      return 'Add your name';
    case 'introVideo':
      return 'Record your intro';
    case 'photos':
      return 'Add a photo';
    default:
      return 'Finish your profile';
  }
}

export function connectSetupGapModalEmoji(gap: ConnectSetupMissing): string {
  switch (gap) {
    case 'age':
      return '🎂';
    case 'gender':
      return '⚧️';
    case 'location':
      return '📍';
    case 'name':
      return '👋';
    case 'introVideo':
      return '📹';
    case 'photos':
      return '📷';
    default:
      return '✨';
  }
}

export function connectSetupGapLeadSub(gap: ConnectSetupMissing): string | null {
  switch (gap) {
    case 'age':
      return 'It helps us show you better local matches — takes about 30 seconds.';
    case 'gender':
      return 'So we can match you with people who fit your preferences.';
    case 'location':
      return 'Southern Oregon matches work best when we know your city.';
    case 'name':
      return "A first name is all we need so matches know who they're talking to.";
    case 'introVideo':
      return 'A short hello so matches see the real you when you connect.';
    default:
      return null;
  }
}

export type ConnectSetupNavigationTarget = {
  screen: 'Settings' | 'MyProfile' | 'IntroVideoRecord';
  params?: { scrollToPhotos?: boolean };
};

export function connectSetupGapNavigationTarget(first: ConnectSetupMissing): ConnectSetupNavigationTarget {
  if (first === 'name') return { screen: 'Settings' };
  if (first === 'introVideo') return { screen: 'IntroVideoRecord' };
  return { screen: 'MyProfile', params: first === 'photos' ? { scrollToPhotos: true } : undefined };
}
