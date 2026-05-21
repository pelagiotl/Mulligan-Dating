import { hasCityAndState } from './locationUtils';

export const MOBILE_CREATE_PROFILE_STEPS = 14;
export const MOBILE_CREATE_PROFILE_DRAFT_KEY = 'mulligan:create-profile:mobile';

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
  age: string;
  gender: string;
  location: string;
  interests: string[];
  preferredGenders: string[];
  minAge: number;
  maxAge: number;
  maxDistance: number | null;
  photoCount: number;
  minPhotosRequired: number;
};

export function computeMobileCreateProfileResumeStep(input: MobileProfileProgressInput): number {
  if (input.displayName.trim().length < 2) return 1;

  const ageNum = parseInt(input.age, 10);
  if (!input.age.trim() || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) return 2;

  if (!input.gender.trim()) return 3;

  if (input.preferredGenders.length < 1) return 4;

  if (!hasCityAndState(input.location)) return 5;

  // Steps 6–10: bio, dealbreakers, partner qualities, lifestyle are optional
  if (input.interests.length < 3) return 7;

  if (input.minAge < 18) return 11;

  if (input.maxAge < input.minAge) return 12;

  if (input.maxDistance == null || input.maxDistance < 1) return 13;

  if (input.photoCount < input.minPhotosRequired) return MOBILE_CREATE_PROFILE_STEPS;

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
