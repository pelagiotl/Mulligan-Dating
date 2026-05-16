/**
 * Labels / options for My Profile sections — kept in sync with web `MyProfile.tsx`.
 */

export const LOOKING_FOR_OPTIONS = [
  'Relationship',
  'Something casual',
  'Friendship',
  'Not sure yet',
] as const;

export type LookingForOption = (typeof LOOKING_FOR_OPTIONS)[number];

export const LOOKING_FOR_META: Record<LookingForOption, { emoji: string; sub: string }> = {
  Relationship: { emoji: '💘', sub: 'Long-term and meaningful' },
  'Something casual': { emoji: '🥂', sub: 'Low-pressure and fun' },
  Friendship: { emoji: '🫶', sub: 'New friends and connections' },
  'Not sure yet': { emoji: '✨', sub: 'Open to seeing where it goes' },
};

export function isCanonicalLookingFor(v: string | null | undefined): v is LookingForOption {
  return !!v && (LOOKING_FOR_OPTIONS as readonly string[]).includes(v);
}

export const DEALBREAKER_SUGGESTIONS = [
  'Smokes cigarettes',
  'Marijuana',
  'Frequent drinking',
  "Doesn't want children",
  'Wants children',
  "Doesn't workout",
  "Doesn't like pets",
  'Religious',
  'Political',
] as const;

export const DEALBREAKER_CANONICAL_SET = new Set<string>(DEALBREAKER_SUGGESTIONS);

export const DEALBREAKER_EMOJI: Record<(typeof DEALBREAKER_SUGGESTIONS)[number], string> = {
  'Smokes cigarettes': '🚬',
  Marijuana: '🌿',
  'Frequent drinking': '🍷',
  "Doesn't want children": '👶❌',
  'Wants children': '👪',
  "Doesn't workout": '🛋️',
  "Doesn't like pets": '🐕❌',
  Religious: '⛪',
  Political: '🗳️',
};

export function canonicalDealbreakerLabel(
  raw: string | null | undefined
): (typeof DEALBREAKER_SUGGESTIONS)[number] | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toLowerCase();
  const found = DEALBREAKER_SUGGESTIONS.find((s) => s.toLowerCase() === t);
  return found ?? null;
}

/** Same list as CreateProfile `INTEREST_OPTIONS` / web partner qualities. */
export const PARTNER_QUALITY_OPTIONS = [
  'Travel',
  'Music',
  'Sports',
  'Cooking',
  'Reading',
  'Movies',
  'Fitness',
  'Art',
  'Photography',
  'Dancing',
  'Gaming',
  'Fortnite',
  'Hiking',
  'Yoga',
  'Writing',
  'Technology',
  'Fashion',
  'Animals',
  'Volunteering',
  'Coffee',
  'Nightlife',
  'Comedy',
  'Beach',
  'Camping',
  'Board Games',
  'Tattoos',
  'Meditation',
  'History',
  'Science',
  'Business',
  'Education',
] as const;

export const PARTNER_QUALITY_EMOJI: Record<string, string> = {
  Travel: '✈️',
  Music: '🎵',
  Sports: '⚽',
  Cooking: '👨‍🍳',
  Reading: '📚',
  Movies: '🎬',
  Fitness: '💪',
  Art: '🎨',
  Photography: '📸',
  Dancing: '💃',
  Gaming: '🎮',
  Fortnite: '⛏️',
  Hiking: '🥾',
  Yoga: '🧘',
  Writing: '✍️',
  Technology: '💻',
  Fashion: '👗',
  Animals: '🐾',
  Volunteering: '🤝',
  Coffee: '☕',
  Nightlife: '🌃',
  Comedy: '😂',
  Beach: '🏖️',
  Camping: '⛺',
  'Board Games': '🎲',
  Tattoos: '🖋️',
  Meditation: '🧘‍♀️',
  History: '📜',
  Science: '🔬',
  Business: '💼',
  Education: '🎓',
};

export function isCanonicalPartnerQuality(v: string): v is (typeof PARTNER_QUALITY_OPTIONS)[number] {
  return (PARTNER_QUALITY_OPTIONS as readonly string[]).includes(v);
}

export const LIFESTYLE_FIELD_OPTIONS = {
  smoking: ['', 'Non-smoker', 'Social smoker', 'Smoker', 'Trying to quit', 'Prefer not to say'],
  drinking: ['', 'Non-drinker', 'Socially', 'Regularly', 'Sober-curious', 'Prefer not to say'],
  children: ['', 'Want kids', 'Don’t want kids', 'Open to either', 'Have kids', 'Prefer not to say'],
  pets: ['', 'Love pets', 'Allergic', 'No pets', 'Open to pets', 'Prefer not to say'],
  religion: ['', 'Very important', 'Somewhat important', 'Spiritual not religious', 'Not important', 'Prefer not to say'],
  political: ['', 'Very important', 'Somewhat important', 'Prefer not political', 'Not important', 'Prefer not to say'],
  workLifeBalance: ['', 'Career-focused', 'Balanced', 'Life-first', 'Flexible', 'Prefer not to say'],
  worksOut: ['', 'Daily', 'Often', 'Sometimes', 'Rarely', 'Prefer not to say'],
} as const;

export type LifestyleFieldKey = keyof typeof LIFESTYLE_FIELD_OPTIONS;

export const LIFESTYLE_FIELD_LABEL: Record<LifestyleFieldKey, string> = {
  smoking: 'Smoking',
  drinking: 'Drinking',
  children: 'Children',
  pets: 'Pets',
  religion: 'Religion',
  political: 'Politics',
  workLifeBalance: 'Work-life balance',
  worksOut: 'Works out',
};

export type LifestyleForm = {
  smoking: string;
  drinking: string;
  children: string;
  pets: string;
  religion: string;
  political: string;
  workLifeBalance: string;
  worksOut: string;
};

export type LifestyleApiShape = {
  smoking: string | null;
  drinking: string | null;
  children: string | null;
  pets: string | null;
  religion: string | null;
  political?: string | null;
  work_life_balance: string | null;
  works_out: string | null;
} | null;

export function lifestyleFormFromApi(l: LifestyleApiShape): LifestyleForm {
  if (!l) {
    return {
      smoking: '',
      drinking: '',
      children: '',
      pets: '',
      religion: '',
      political: '',
      workLifeBalance: '',
      worksOut: '',
    };
  }
  return {
    smoking: l.smoking || '',
    drinking: l.drinking || '',
    children: l.children || '',
    pets: l.pets || '',
    religion: l.religion || '',
    political: l.political || '',
    workLifeBalance: l.work_life_balance || '',
    worksOut: l.works_out || '',
  };
}
