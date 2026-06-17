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

export const VALID_PROFILE_GENDERS = ['Man', 'Woman', 'Other'] as const;

export function hasValidProfileAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && !Number.isNaN(age) && age >= 18 && age <= 120;
}

export function hasValidProfileGender(gender: string | null | undefined): boolean {
  const g = (gender ?? '').trim();
  return (VALID_PROFILE_GENDERS as readonly string[]).includes(g);
}

export function hasIntroVideo(introVideoUrl: string | null | undefined): boolean {
  return typeof introVideoUrl === 'string' && introVideoUrl.trim().length > 0;
}

export type OnboardingProgress = {
  hasName: boolean;
  hasLocation: boolean;
  hasIntroVideo: boolean;
  photoCount: number;
  photosRequired: number;
  /** Share of onboarding + connect steps (0–100). */
  percentComplete: number;
  missing: Array<'profile' | 'name' | 'location' | 'introVideo' | 'age' | 'gender' | 'photos'>;
  /** Name + location + intro video — user may finish onboarding wizard. */
  readyToActivate: boolean;
};

/** Violations for POST /profile/activate (name, location, intro video — no gender/photos). */
export async function getActivationSetupViolationsForUser(userId: string): Promise<string[]> {
  const profileResult = db
    .prepare('SELECT id, display_name, location, intro_video_url FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { id: string; display_name: string; location: string | null; intro_video_url: string | null }
    | undefined;

  if (!profile) return ['profile'];

  const violations: string[] = [];
  if (!hasConnectDisplayName(profile.display_name)) violations.push('name');
  if (!isValidConnectLocation(profile.location)) violations.push('location');
  if (!hasIntroVideo(profile.intro_video_url)) violations.push('introVideo');
  return violations;
}

/** Admin + activation: same rules as getConnectSetupViolationsForUser, from list-row fields. */
export function computeOnboardingProgress(
  displayName: string | null | undefined,
  location: string | null | undefined,
  photoCount: number,
  hasProfileRow: boolean,
  age?: number | null,
  gender?: string | null,
  introVideoUrl?: string | null,
): OnboardingProgress {
  const photosRequired = MIN_PHOTOS_TO_CONNECT;
  const missing: OnboardingProgress['missing'] = [];
  if (!hasProfileRow) missing.push('profile');
  const hasName = hasConnectDisplayName(displayName);
  const hasLocation = isValidConnectLocation(location);
  const hasAge = hasValidProfileAge(age ?? null);
  const hasGender = hasValidProfileGender(gender ?? null);
  const hasIntro = hasIntroVideo(introVideoUrl ?? null);
  const safePhotoCount = Math.max(0, Math.floor(photoCount));
  if (!hasName) missing.push('name');
  if (!hasLocation) missing.push('location');
  if (!hasIntro) missing.push('introVideo');
  if (!hasAge) missing.push('age');
  if (!hasGender) missing.push('gender');
  if (safePhotoCount < photosRequired) missing.push('photos');

  const activationSteps = 3;
  const activationDone =
    (hasName ? 1 : 0) + (hasLocation ? 1 : 0) + (hasIntro ? 1 : 0);
  const connectSteps = activationSteps + 3;
  const connectDone =
    activationDone +
    (hasAge ? 1 : 0) +
    (hasGender ? 1 : 0) +
    (Math.min(safePhotoCount, photosRequired) >= photosRequired ? 1 : 0);
  const percentComplete = Math.round((connectDone / connectSteps) * 100);

  const activationMissing: OnboardingProgress['missing'] = [];
  if (!hasProfileRow) activationMissing.push('profile');
  if (!hasName) activationMissing.push('name');
  if (!hasLocation) activationMissing.push('location');
  if (!hasIntro) activationMissing.push('introVideo');

  return {
    hasName,
    hasLocation,
    hasIntroVideo: hasIntro,
    photoCount: safePhotoCount,
    photosRequired,
    percentComplete,
    missing,
    readyToActivate: activationMissing.length === 0,
  };
}

export async function getProfilePhotoCount(profileId: string): Promise<number> {
  const countResult = db.prepare('SELECT COUNT(*) as c FROM photos WHERE profile_id = ?').get([profileId]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as
    | { c: number | string }
    | undefined;
  return Math.floor(Number(countRow?.c ?? 0));
}

export async function profileHasMinPhotosForConnect(profileId: string): Promise<boolean> {
  return (await getProfilePhotoCount(profileId)) >= MIN_PHOTOS_TO_CONNECT;
}

export async function getConnectSetupViolationsForUser(userId: string): Promise<string[]> {
  const activation = await getActivationSetupViolationsForUser(userId);
  if (activation.length > 0) return activation;

  const profileResult = db
    .prepare('SELECT id, age, gender, intro_video_url FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { id: string; age: number | null; gender: string | null; intro_video_url: string | null }
    | undefined;
  if (!profile) return ['profile'];

  if (!hasValidProfileAge(profile.age)) return ['age'];
  if (!hasValidProfileGender(profile.gender)) return ['gender'];
  if (!hasIntroVideo(profile.intro_video_url)) return ['introVideo'];

  if (!(await profileHasMinPhotosForConnect(profile.id))) return ['photos'];

  return [];
}

export function connectSetupErrorPayload(violations: string[]) {
  const messages: Record<string, string> = {
    profile: 'Complete your profile first.',
    name: 'Add your name in Settings before connecting.',
    location: 'Add your city and state on your Profile before connecting (e.g. Medford, Oregon).',
    age: 'Add your age on your Profile before connecting.',
    gender: 'Add your gender on your Profile before connecting.',
    introVideo: 'Record your 10-second intro video before connecting.',
    photos: `Upload at least ${minPhotosToConnectPhrase()} on your Profile to start matching with other people.`,
  };
  const primary = violations.includes('photos')
    ? 'photos'
    : violations.includes('introVideo')
      ? 'introVideo'
      : violations[0] ?? 'profile';
  return {
    error: messages[primary] || 'Complete your profile to connect.',
    code: 'CONNECT_SETUP_INCOMPLETE' as const,
    missing: violations,
  };
}
