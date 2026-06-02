import {
  profileEnhancementPhotoHint,
  profileEnhancementPhotoLabel,
} from '../constants/connectPhotoCopy';
import { MIN_PHOTOS_TO_CONNECT } from './connectSetup';

export const PROFILE_ENHANCEMENT_PHOTO_TARGET = Math.max(2, MIN_PHOTOS_TO_CONNECT + 1);

export const PROFILE_ENHANCEMENT_MIN_INTERESTS = 3;

/** One answered lifestyle field is enough for Better matches (e.g. non-drinker). */
export const PROFILE_ENHANCEMENT_MIN_LIFESTYLE_FIELDS = 1;

export const PROFILE_ENHANCEMENT_DISMISS_KEY = 'mulligan:connect-profile-enhancement-dismissed-until';

export const PROFILE_ENHANCEMENT_CELEBRATION_KEY =
  'mulligan:connect-profile-enhancement-celebrated';

export const PROFILE_ENHANCEMENT_DISMISS_DAYS = 7;

export type ProfileEnhancementSectionId =
  | 'photos'
  | 'interests'
  | 'looking-for'
  | 'lifestyle'
  | 'dealbreakers';

export type ProfileEnhancementItem = {
  id: ProfileEnhancementSectionId;
  label: string;
  /** Optional subtext (e.g. photo recommendation). */
  hint?: string;
  done: boolean;
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
  'smoking',
  'drinking',
  'children',
  'pets',
  'religion',
  'political',
  'work_life_balance',
  'works_out',
] as const;

function lifestyleFieldCount(lifestyle: ProfileEnhancementSnapshot['lifestyle']): number {
  if (!lifestyle) return 0;
  return LIFESTYLE_KEYS.filter((key) => {
    const v = lifestyle[key];
    return typeof v === 'string' && v.trim().length > 0;
  }).length;
}

export function isLookingForEnhancementComplete(lookingFor: string | null | undefined): boolean {
  return typeof lookingFor === 'string' && lookingFor.trim().length > 0;
}

export function buildProfileEnhancementChecklist(
  snapshot: ProfileEnhancementSnapshot
): ProfileEnhancementItem[] {
  return [
    {
      id: 'photos',
      label: profileEnhancementPhotoLabel(snapshot.photoCount),
      hint: profileEnhancementPhotoHint(snapshot.photoCount),
      done: snapshot.photoCount >= PROFILE_ENHANCEMENT_PHOTO_TARGET,
    },
    {
      id: 'interests',
      label: 'Add interests (3+)',
      done: snapshot.interestsCount >= PROFILE_ENHANCEMENT_MIN_INTERESTS,
    },
    {
      id: 'looking-for',
      label: 'Looking for (relationship)',
      done: isLookingForEnhancementComplete(snapshot.lookingFor),
    },
    {
      id: 'lifestyle',
      label: 'Lifestyle details (1+)',
      done: lifestyleFieldCount(snapshot.lifestyle) >= PROFILE_ENHANCEMENT_MIN_LIFESTYLE_FIELDS,
    },
    {
      id: 'dealbreakers',
      label: 'My dealbreakers',
      done: snapshot.dealbreakersCount >= 1,
    },
  ];
}

export function profileEnhancementIncomplete(
  snapshot: ProfileEnhancementSnapshot
): ProfileEnhancementItem[] {
  return buildProfileEnhancementChecklist(snapshot).filter((item) => !item.done);
}

export function profileEnhancementIsComplete(snapshot: ProfileEnhancementSnapshot): boolean {
  return profileEnhancementIncomplete(snapshot).length === 0;
}

export async function readProfileEnhancementDismissedUntil(): Promise<number> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(PROFILE_ENHANCEMENT_DISMISS_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function isProfileEnhancementDismissed(): Promise<boolean> {
  const until = await readProfileEnhancementDismissedUntil();
  return Date.now() < until;
}

export async function dismissProfileEnhancement(
  days = PROFILE_ENHANCEMENT_DISMISS_DAYS
): Promise<void> {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(PROFILE_ENHANCEMENT_DISMISS_KEY, String(until));
  } catch {
    /* ignore */
  }
}

export async function clearProfileEnhancementDismiss(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(PROFILE_ENHANCEMENT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

export async function isProfileEnhancementCelebrationShown(): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return (await AsyncStorage.getItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markProfileEnhancementCelebrationShown(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function clearProfileEnhancementCelebrationShown(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(PROFILE_ENHANCEMENT_CELEBRATION_KEY);
  } catch {
    /* ignore */
  }
}
