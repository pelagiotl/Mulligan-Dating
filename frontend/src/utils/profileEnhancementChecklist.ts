import {
  profileEnhancementPhotoHint,
  profileEnhancementPhotoLabel,
} from "../constants/connectPhotoCopy";
import { isProfileAgeUnset, shouldClearLoadedProfileAge } from "./createProfileProgress";
import { MIN_PHOTOS_TO_CONNECT } from "./connectProfileEligibility";

/** Encourage more than the connect minimum. */
export const PROFILE_ENHANCEMENT_PHOTO_TARGET = Math.max(2, MIN_PHOTOS_TO_CONNECT + 1);

export const PROFILE_ENHANCEMENT_MIN_INTERESTS = 3;

/** One answered lifestyle field is enough for Better matches (e.g. non-drinker). */
export const PROFILE_ENHANCEMENT_MIN_LIFESTYLE_FIELDS = 1;

export const PROFILE_ENHANCEMENT_DISMISS_KEY = "mulligan:connect-profile-enhancement-dismissed-until";

export const PROFILE_ENHANCEMENT_CELEBRATION_KEY =
  "mulligan:connect-profile-enhancement-celebrated";

export const PROFILE_ENHANCEMENT_DISMISS_DAYS = 7;

export const PROFILE_ENHANCEMENT_VALID_GENDERS = ["Man", "Woman", "Other"] as const;

export type ProfileEnhancementSectionId =
  | "photos"
  | "age"
  | "gender"
  | "interests"
  | "looking-for"
  | "lifestyle"
  | "dealbreakers";

/** Total checklist items shown in Connect “Better matches” progress (e.g. 4/7). */
export const PROFILE_ENHANCEMENT_CHECKLIST_SIZE = 7;

export type ProfileEnhancementItem = {
  id: ProfileEnhancementSectionId;
  label: string;
  /** Optional subtext (e.g. photo recommendation). */
  hint?: string;
  done: boolean;
  profileHash: string;
};

export type ProfileEnhancementSnapshot = {
  photoCount: number;
  age: number | null | undefined;
  gender: string | null | undefined;
  interestsCount: number;
  lookingFor: string | null | undefined;
  lifestyle: {
    smoking?: string | null;
    drinking?: string | null;
    children?: string | null;
    pets?: string | null;
    religion?: string | null;
    political?: string | null;
    work_life_balance?: string | null;
    works_out?: string | null;
  } | null;
  dealbreakersCount: number;
};

const LIFESTYLE_KEYS = [
  "smoking",
  "drinking",
  "children",
  "pets",
  "religion",
  "political",
  "work_life_balance",
  "works_out",
] as const;

function lifestyleFieldCount(
  lifestyle: ProfileEnhancementSnapshot["lifestyle"]
): number {
  if (!lifestyle) return 0;
  return LIFESTYLE_KEYS.filter((key) => {
    const v = lifestyle[key];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
}

export function isLookingForEnhancementComplete(
  lookingFor: string | null | undefined
): boolean {
  return typeof lookingFor === "string" && lookingFor.trim().length > 0;
}

export function isAgeEnhancementComplete(
  age: number | null | undefined,
  gender?: string | null | undefined
): boolean {
  if (shouldClearLoadedProfileAge(age, gender)) return false;
  return !isProfileAgeUnset(age);
}

export function isGenderEnhancementComplete(gender: string | null | undefined): boolean {
  return (
    typeof gender === "string" &&
    PROFILE_ENHANCEMENT_VALID_GENDERS.includes(
      gender.trim() as (typeof PROFILE_ENHANCEMENT_VALID_GENDERS)[number]
    )
  );
}

export const PROFILE_ENHANCEMENT_HASH: Record<ProfileEnhancementSectionId, string> = {
  photos: "my-photos",
  age: "my-profile-age",
  gender: "my-profile-gender",
  interests: "my-interests",
  "looking-for": "my-profile-looking-for",
  lifestyle: "my-lifestyle",
  dealbreakers: "my-dealbreakers",
};

export function buildProfileEnhancementChecklist(
  snapshot: ProfileEnhancementSnapshot
): ProfileEnhancementItem[] {
  const items: ProfileEnhancementItem[] = [
    {
      id: "photos",
      label: profileEnhancementPhotoLabel(snapshot.photoCount),
      hint: profileEnhancementPhotoHint(snapshot.photoCount),
      done: snapshot.photoCount >= PROFILE_ENHANCEMENT_PHOTO_TARGET,
      profileHash: PROFILE_ENHANCEMENT_HASH.photos,
    },
    {
      id: "age",
      label: "Age",
      hint: "Confirm your age for matching",
      done: isAgeEnhancementComplete(snapshot.age, snapshot.gender),
      profileHash: PROFILE_ENHANCEMENT_HASH.age,
    },
    {
      id: "gender",
      label: "Gender",
      hint: "Helps us show you relevant matches",
      done: isGenderEnhancementComplete(snapshot.gender),
      profileHash: PROFILE_ENHANCEMENT_HASH.gender,
    },
    {
      id: "interests",
      label: "Add interests (3+)",
      done: snapshot.interestsCount >= PROFILE_ENHANCEMENT_MIN_INTERESTS,
      profileHash: PROFILE_ENHANCEMENT_HASH.interests,
    },
    {
      id: "looking-for",
      label: "Looking for (relationship)",
      done: isLookingForEnhancementComplete(snapshot.lookingFor),
      profileHash: PROFILE_ENHANCEMENT_HASH["looking-for"],
    },
    {
      id: "lifestyle",
      label: "Lifestyle details (1+)",
      done: lifestyleFieldCount(snapshot.lifestyle) >= PROFILE_ENHANCEMENT_MIN_LIFESTYLE_FIELDS,
      profileHash: PROFILE_ENHANCEMENT_HASH.lifestyle,
    },
    {
      id: "dealbreakers",
      label: "My dealbreakers",
      done: snapshot.dealbreakersCount >= 1,
      profileHash: PROFILE_ENHANCEMENT_HASH.dealbreakers,
    },
  ];
  return items;
}

export function profileEnhancementIncomplete(
  snapshot: ProfileEnhancementSnapshot
): ProfileEnhancementItem[] {
  return buildProfileEnhancementChecklist(snapshot).filter((item) => !item.done);
}

export function profileEnhancementIsComplete(
  snapshot: ProfileEnhancementSnapshot
): boolean {
  return profileEnhancementIncomplete(snapshot).length === 0;
}

export function readProfileEnhancementDismissedUntil(): number {
  try {
    const raw = localStorage.getItem(PROFILE_ENHANCEMENT_DISMISS_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function isProfileEnhancementDismissed(): boolean {
  return Date.now() < readProfileEnhancementDismissedUntil();
}

export function dismissProfileEnhancement(days = PROFILE_ENHANCEMENT_DISMISS_DAYS): void {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(PROFILE_ENHANCEMENT_DISMISS_KEY, String(until));
  } catch {
    /* private mode */
  }
}

export function clearProfileEnhancementDismiss(): void {
  try {
    localStorage.removeItem(PROFILE_ENHANCEMENT_DISMISS_KEY);
  } catch {
    /* private mode */
  }
}

export function isProfileEnhancementCelebrationShown(): boolean {
  try {
    return localStorage.getItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markProfileEnhancementCelebrationShown(): void {
  try {
    localStorage.setItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function clearProfileEnhancementCelebrationShown(): void {
  try {
    localStorage.removeItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY);
  } catch {
    /* private mode */
  }
}
