import { MIN_PHOTOS_TO_CONNECT } from "./connectProfileEligibility";

/** Encourage more than the connect minimum. */
export const PROFILE_ENHANCEMENT_PHOTO_TARGET = Math.max(2, MIN_PHOTOS_TO_CONNECT + 1);

export const PROFILE_ENHANCEMENT_MIN_INTERESTS = 3;

export const PROFILE_ENHANCEMENT_MIN_LIFESTYLE_FIELDS = 2;

export const PROFILE_ENHANCEMENT_DISMISS_KEY = "mulligan:connect-profile-enhancement-dismissed-until";

export const PROFILE_ENHANCEMENT_DISMISS_DAYS = 7;

export type ProfileEnhancementSectionId =
  | "photos"
  | "interests"
  | "looking-for"
  | "lifestyle"
  | "dealbreakers";

export type ProfileEnhancementItem = {
  id: ProfileEnhancementSectionId;
  label: string;
  done: boolean;
  profileHash: string;
};

export type ProfileEnhancementSnapshot = {
  photoCount: number;
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

export const PROFILE_ENHANCEMENT_HASH: Record<ProfileEnhancementSectionId, string> = {
  photos: "my-photos",
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
      label:
        snapshot.photoCount < MIN_PHOTOS_TO_CONNECT
          ? "Add a profile photo"
          : "Add more photos",
      done: snapshot.photoCount >= PROFILE_ENHANCEMENT_PHOTO_TARGET,
      profileHash: PROFILE_ENHANCEMENT_HASH.photos,
    },
    {
      id: "interests",
      label: "Add interests (3+)",
      done: snapshot.interestsCount >= PROFILE_ENHANCEMENT_MIN_INTERESTS,
      profileHash: PROFILE_ENHANCEMENT_HASH.interests,
    },
    {
      id: "looking-for",
      label: "What I'm looking for",
      done: isLookingForEnhancementComplete(snapshot.lookingFor),
      profileHash: PROFILE_ENHANCEMENT_HASH["looking-for"],
    },
    {
      id: "lifestyle",
      label: "Lifestyle details",
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
