import { hasCityAndState } from "./locationUtils";

export const WEB_CREATE_PROFILE_STEPS = 2;
export const WEB_CREATE_PROFILE_DRAFT_KEY = "mulligan:create-profile:web";

/** Placeholders for fields completed later in Settings (not shown in onboarding). */
export const ONBOARDING_DEFAULT_AGE = 18;
export const ONBOARDING_DEFAULT_GENDER = "Not specified";
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
  const g = (gender ?? "").trim();
  return !g || g === ONBOARDING_DEFAULT_GENDER;
}

/** Short label for profile cards when gender was not set during onboarding. */
export function displayProfileGender(gender: string | null | undefined): string {
  return isStubProfileGender(gender) ? "Not set" : (gender ?? "").trim();
}

export function resolveOnboardingPreferredGenders(preferredGenders: string[]): string[] {
  return preferredGenders.length > 0 ? preferredGenders : ["Everyone"];
}

export type DraftPhotoSlot = { id: string; url: string };

export type WebCreateProfileDraft = {
  step?: number;
  displayName?: string;
  age?: string;
  gender?: string;
  location?: string;
  bio?: string;
  interests?: string[];
  preferredGenders?: string[];
  minAge?: number;
  maxAge?: number;
  maxDistance?: number;
  photoSlots?: Array<DraftPhotoSlot | null>;
};

export type WebProfileProgressInput = {
  displayName: string;
  location: string;
};

export function computeWebCreateProfileResumeStep(input: WebProfileProgressInput): number {
  if (input.displayName.trim().length < 2) return 1;
  if (!hasCityAndState(input.location)) return 2;
  return WEB_CREATE_PROFILE_STEPS;
}

export function readWebCreateProfileDraft(): WebCreateProfileDraft | null {
  try {
    const raw = localStorage.getItem(WEB_CREATE_PROFILE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WebCreateProfileDraft;
  } catch {
    return null;
  }
}

/** True while the user has not tapped Complete Profile (draft cleared on finish). */
export function hasWebCreateProfileDraft(): boolean {
  return readWebCreateProfileDraft() != null;
}

export function writeWebCreateProfileDraft(draft: WebCreateProfileDraft): void {
  try {
    localStorage.setItem(WEB_CREATE_PROFILE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage full or private mode */
  }
}

export function clearWebCreateProfileDraft(): void {
  try {
    localStorage.removeItem(WEB_CREATE_PROFILE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Restore wizard marker if onboarding was interrupted. */
export function ensureWebOnboardingDraft(): void {
  if (readWebCreateProfileDraft()) return;
  writeWebCreateProfileDraft({ step: WEB_CREATE_PROFILE_STEPS });
}
