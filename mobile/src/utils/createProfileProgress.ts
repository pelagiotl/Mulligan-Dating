export const MOBILE_CREATE_PROFILE_STEPS = 1;
export const MOBILE_CREATE_PROFILE_DRAFT_KEY = 'mulligan:create-profile:mobile';

/** Preference defaults — not written as the member's profile age. */
export const ONBOARDING_DEFAULT_MIN_AGE = 18;
export const ONBOARDING_DEFAULT_MAX_AGE = 100;
export const ONBOARDING_DEFAULT_MAX_DISTANCE = 50;

/** Legacy placeholder gender from onboarding saves before Profile is completed. */
export const ONBOARDING_DEFAULT_GENDER = 'Not specified';

export const ONBOARDING_GENDER_OPTIONS = ['Man', 'Woman', 'Other'] as const;
export type OnboardingGenderOption = (typeof ONBOARDING_GENDER_OPTIONS)[number];

/** @deprecated Server used to auto-insert 18; treat as unset when gender is still a stub. */
export const ONBOARDING_LEGACY_AUTO_AGE = 18;

export function isProfileAgeUnset(age: number | null | undefined): boolean {
  return age == null || typeof age !== 'number' || Number.isNaN(age) || age < 18 || age > 120;
}

export function shouldClearLoadedProfileAge(
  age: number | null | undefined,
  gender: string | null | undefined
): boolean {
  if (isProfileAgeUnset(age)) return true;
  const g = (gender ?? '').trim();
  return (
    age === ONBOARDING_LEGACY_AUTO_AGE &&
    (!g || g === ONBOARDING_DEFAULT_GENDER || g === 'Other')
  );
}

export function parseOnboardingAgeOrNull(age: string): number | null {
  const n = parseInt(age, 10);
  if (age.trim() && !Number.isNaN(n) && n >= 18 && n <= 120) return n;
  return null;
}

export function finitePreferenceAge(
  value: number | null | undefined,
  fallback: number
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 18 && value <= 120) {
    return Math.round(value);
  }
  return fallback;
}

/** @deprecated Use {@link parseOnboardingAgeOrNull}; do not default age during onboarding. */
export function resolveOnboardingAge(age: string): number {
  return parseOnboardingAgeOrNull(age) ?? ONBOARDING_LEGACY_AUTO_AGE;
}

export function displayProfileAge(age: number | null | undefined): string {
  return isProfileAgeUnset(age) ? 'Not set' : String(age);
}

export function isOnboardingGenderComplete(gender: string | null | undefined): boolean {
  const t = (gender ?? '').trim();
  return ONBOARDING_GENDER_OPTIONS.includes(t as OnboardingGenderOption);
}

export function resolveOnboardingGender(gender: string): string {
  const t = gender.trim();
  return t || ONBOARDING_DEFAULT_GENDER;
}

export function isStubProfileGender(gender: string | null | undefined): boolean {
  const g = (gender ?? '').trim();
  return !g || g === ONBOARDING_DEFAULT_GENDER || !isOnboardingGenderComplete(g);
}

export type OnboardingBasicsInput = {
  displayName: string;
  location: string;
  age: string;
  gender: string;
};

/** Client-side gate for Complete Profile — name, location, and gender (age optional during onboarding). */
export function validateOnboardingBasics(
  input: OnboardingBasicsInput,
  options?: { requireAge?: boolean }
): string | null {
  const requireAge = options?.requireAge === true;
  if (input.displayName.trim().length < 2) {
    return 'Please enter at least 2 characters for your name';
  }
  const loc = input.location.trim();
  const comma = loc.indexOf(',');
  if (comma === -1 || loc.slice(0, comma).trim().length === 0 || loc.slice(comma + 1).trim().length === 0) {
    return 'Please enter both city and state (e.g. Medford, Oregon)';
  }
  if (requireAge && isProfileAgeUnset(parseOnboardingAgeOrNull(input.age))) {
    return 'Enter your age (18 or older).';
  }
  if (!isOnboardingGenderComplete(input.gender)) {
    return 'Please select your gender.';
  }
  return null;
}

/** Short label for profile cards when gender was not set during onboarding. */
export function displayProfileGender(gender: string | null | undefined): string {
  return isStubProfileGender(gender) ? 'Not set' : (gender ?? '').trim();
}

export function resolveOnboardingPreferredGenders(preferredGenders: string[]): string[] {
  return preferredGenders.length > 0 ? preferredGenders : ['Everyone'];
}

export type DraftPhotoSlot = { id: string; url: string };

export type MobileCreateProfileDraft = {
  step?: number;
  displayName?: string;
  age?: string;
  gender?: string;
  location?: string;
  bio?: string;
  interests?: string[];
  dealbreakers?: string[];
  partnerQualities?: string[];
  preferredGenders?: string[];
  minAge?: number;
  maxAge?: number;
  maxDistance?: number | null;
  photoSlots?: Array<DraftPhotoSlot | null>;
};

export type MobileProfileProgressInput = {
  displayName: string;
  location: string;
};

/** Onboarding is a single screen until Complete Profile. */
export function computeMobileCreateProfileResumeStep(_input: MobileProfileProgressInput): number {
  return 1;
}

export async function readMobileCreateProfileDraft(): Promise<MobileCreateProfileDraft | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(MOBILE_CREATE_PROFILE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MobileCreateProfileDraft;
  } catch {
    return null;
  }
}

/** True while the user has not tapped Complete Profile (draft cleared on finish). */
export async function hasMobileCreateProfileDraft(): Promise<boolean> {
  return (await readMobileCreateProfileDraft()) != null;
}

export async function writeMobileCreateProfileDraft(draft: MobileCreateProfileDraft): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(MOBILE_CREATE_PROFILE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export async function clearMobileCreateProfileDraft(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(MOBILE_CREATE_PROFILE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Restore wizard marker if onboarding was interrupted. */
export async function ensureMobileOnboardingDraft(): Promise<void> {
  if (await readMobileCreateProfileDraft()) return;
  await writeMobileCreateProfileDraft({ step: MOBILE_CREATE_PROFILE_STEPS });
}
