import { db } from '../database.js';

export const MIN_PHOTOS_TO_CONNECT = 1;

function minPhotosToConnectPhrase(): string {
  return MIN_PHOTOS_TO_CONNECT === 1 ? '1 photo' : `${MIN_PHOTOS_TO_CONNECT} photos`;
}

export function hasConnectDisplayName(displayName: string | null | undefined): boolean {
  return typeof displayName === 'string' && displayName.trim().length >= 2;
}

/** Same rule as profile Zod: city and state separated by a comma. */
export function isValidConnectLocation(location: string | null | undefined): boolean {
  if (location == null || typeof location !== 'string') return false;
  const t = location.trim();
  const i = t.indexOf(',');
  if (i === -1) return false;
  return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
}

export type OnboardingProgress = {
  hasName: boolean;
  hasLocation: boolean;
  photoCount: number;
  photosRequired: number;
  /** Share of name + location + min photos (0–100). */
  percentComplete: number;
  missing: Array<'profile' | 'name' | 'location' | 'photos'>;
  /** Name + location only — user may tap Complete Profile without photos. */
  readyToActivate: boolean;
};

/** Violations for POST /profile/activate and browse routing (no photos). */
export async function getActivationSetupViolationsForUser(userId: string): Promise<string[]> {
  const profileResult = db
    .prepare('SELECT id, display_name, location FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { id: string; display_name: string; location: string | null }
    | undefined;

  if (!profile) return ['profile'];

  const violations: string[] = [];
  if (!hasConnectDisplayName(profile.display_name)) violations.push('name');
  if (!isValidConnectLocation(profile.location)) violations.push('location');
  return violations;
}

/** Admin + activation: same rules as getConnectSetupViolationsForUser, from list-row fields. */
export function computeOnboardingProgress(
  displayName: string | null | undefined,
  location: string | null | undefined,
  photoCount: number,
  hasProfileRow: boolean,
): OnboardingProgress {
  const photosRequired = MIN_PHOTOS_TO_CONNECT;
  const missing: OnboardingProgress['missing'] = [];
  if (!hasProfileRow) missing.push('profile');
  const hasName = hasConnectDisplayName(displayName);
  const hasLocation = isValidConnectLocation(location);
  const safePhotoCount = Math.max(0, Math.floor(photoCount));
  if (!hasName) missing.push('name');
  if (!hasLocation) missing.push('location');
  if (safePhotoCount < photosRequired) missing.push('photos');

  const stepsDone =
    (hasName ? 1 : 0) + (hasLocation ? 1 : 0) + (Math.min(safePhotoCount, photosRequired) >= photosRequired ? 1 : 0);
  const percentComplete = Math.round((stepsDone / 3) * 100);

  const activationMissing: OnboardingProgress['missing'] = [];
  if (!hasProfileRow) activationMissing.push('profile');
  if (!hasName) activationMissing.push('name');
  if (!hasLocation) activationMissing.push('location');

  return {
    hasName,
    hasLocation,
    photoCount: safePhotoCount,
    photosRequired,
    percentComplete,
    missing,
    readyToActivate: activationMissing.length === 0,
  };
}

export async function getConnectSetupViolationsForUser(userId: string): Promise<string[]> {
  const activation = await getActivationSetupViolationsForUser(userId);
  if (activation.length > 0) return activation;

  const profileResult = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { id: string }
    | undefined;
  if (!profile) return ['profile'];

  const countResult = db.prepare('SELECT COUNT(*) as c FROM photos WHERE profile_id = ?').get([profile.id]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as
    | { c: number | string }
    | undefined;
  const photoCount = Math.floor(Number(countRow?.c ?? 0));
  if (photoCount < MIN_PHOTOS_TO_CONNECT) return [...activation, 'photos'];

  return [];
}

export function connectSetupErrorPayload(violations: string[]) {
  const messages: Record<string, string> = {
    profile: 'Complete your profile first.',
    name: 'Add your name in Settings before connecting.',
    location: 'Add your city and state on your Profile before connecting (e.g. Medford, Oregon).',
    photos: `Upload at least ${minPhotosToConnectPhrase()} on your Profile to start matching with other people.`,
  };
  const primary = violations.includes('photos')
    ? 'photos'
    : violations[0] ?? 'profile';
  return {
    error: messages[primary] || 'Complete your profile to connect.',
    code: 'CONNECT_SETUP_INCOMPLETE' as const,
    missing: violations,
  };
}
