import { hasCityAndState } from './locationUtils';

export const MOBILE_CREATE_PROFILE_STEPS = 2;
export const MOBILE_CREATE_PROFILE_DRAFT_KEY = 'mulligan:create-profile:mobile';

/** Placeholders for fields completed later in Settings (not shown in onboarding). */
export const ONBOARDING_DEFAULT_AGE = 18;
export const ONBOARDING_DEFAULT_GENDER = 'Not specified';
export const ONBOARDING_DEFAULT_MIN_AGE = 18;
export const ONBOARDING_DEFAULT_MAX_AGE = 100;
export const ONBOARDING_DEFAULT_MAX_DISTANCE = 50;

export function resolveOnboardingAge(age: string): number {
  const n = parseInt(age, 10);
  if (age.trim() && !Number.isNaN(n) && n >= 18 && n <= 120) return n;
  return ONBOARDING_DEFAULT_AGE;
}

export function resolveOnboardingGender(gender: string): string {
  const t = gender.trim();
  return t || ONBOARDING_DEFAULT_GENDER;
}

export function isStubProfileGender(gender: string | null | undefined): boolean {
  const g = (gender ?? '').trim();
  return !g || g === ONBOARDING_DEFAULT_GENDER;
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

export function computeMobileCreateProfileResumeStep(input: MobileProfileProgressInput): number {
  if (input.displayName.trim().length < 2) return 1;
  if (!hasCityAndState(input.location)) return 2;
  return MOBILE_CREATE_PROFILE_STEPS;
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
