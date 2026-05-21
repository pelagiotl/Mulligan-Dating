import { hasCityAndState } from "./locationUtils";

export const WEB_CREATE_PROFILE_STEPS = 11;
export const WEB_CREATE_PROFILE_DRAFT_KEY = "mulligan:create-profile:web";

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
};

export type WebProfileProgressInput = {
  displayName: string;
  age: string;
  gender: string;
  location: string;
  interests: string[];
  preferredGenders: string[];
  minAge: number;
  maxAge: number;
  maxDistance: number;
  photoCount: number;
  minPhotosRequired: number;
};

export function computeWebCreateProfileResumeStep(input: WebProfileProgressInput): number {
  if (input.displayName.trim().length < 2) return 1;

  const ageNum = parseInt(input.age, 10);
  if (!input.age.trim() || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) return 2;

  if (!input.gender.trim()) return 3;

  if (input.preferredGenders.length < 1) return 4;

  if (!hasCityAndState(input.location)) return 5;

  // Step 6 (bio) is optional — continue to interests
  if (input.interests.length < 3) return 7;

  if (input.minAge < 18) return 8;

  if (input.maxAge < input.minAge) return 9;

  if (input.maxDistance < 1) return 10;

  if (input.photoCount < input.minPhotosRequired) return WEB_CREATE_PROFILE_STEPS;

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
