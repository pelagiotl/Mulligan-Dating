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
  'Frequent drinking',
  "Doesn't want children",
  'Wants children',
  "Doesn't workout",
  "Doesn't like pets",
  'Religious',
  'Political',
  "Doesn't play Fortnite",
] as const;

export const DEALBREAKER_CANONICAL_SET = new Set<string>(DEALBREAKER_SUGGESTIONS);

export const DEALBREAKER_EMOJI: Record<(typeof DEALBREAKER_SUGGESTIONS)[number], string> = {
  'Smokes cigarettes': '🚬',
  'Frequent drinking': '🍷',
  "Doesn't want children": '👶❌',
  'Wants children': '👪',
  "Doesn't workout": '🛋️',
  "Doesn't like pets": '🐕❌',
  Religious: '⛪',
  Political: '🗳️',
  "Doesn't play Fortnite": '⛏️',
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

/** Same options/emojis as partner qualities — used for "My Interests" chips. */
export const INTEREST_EMOJI = PARTNER_QUALITY_EMOJI;

export function getInterestEmoji(interestName: string): string {
  const trimmed = interestName.trim();
  if (!trimmed) return '✨';
  if (INTEREST_EMOJI[trimmed]) return INTEREST_EMOJI[trimmed];
  const key = Object.keys(INTEREST_EMOJI).find((k) => k.toLowerCase() === trimmed.toLowerCase());
  return key ? INTEREST_EMOJI[key]! : '✨';
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
  children: 'Kids & family',
  pets: 'Pets',
  religion: 'Faith & spirituality',
  political: 'Politics',
  workLifeBalance: 'Work & life balance',
  worksOut: 'Fitness & movement',
};

export const LIFESTYLE_FIELD_EMOJI: Record<LifestyleFieldKey, string> = {
  smoking: '🚭',
  drinking: '🍷',
  children: '👶',
  pets: '🐾',
  religion: '✨',
  political: '🗳️',
  workLifeBalance: '⚖️',
  worksOut: '💪',
};

const LIFESTYLE_VALUE_EMOJI: Record<LifestyleFieldKey, Record<string, string>> = {
  smoking: {
    '': '⏭️',
    'Non-smoker': '🚭',
    'Social smoker': '💨',
    Smoker: '🚬',
    'Trying to quit': '🌱',
    'Prefer not to say': '🤐',
  },
  drinking: {
    '': '⏭️',
    'Non-drinker': '🚫',
    Socially: '🥂',
    Regularly: '🍻',
    'Sober-curious': '🌿',
    'Prefer not to say': '🤐',
  },
  children: {
    '': '⏭️',
    'Want kids': '👶',
    'Don’t want kids': '🙅',
    'Open to either': '🤷',
    'Have kids': '👨‍👩‍👧',
    'Prefer not to say': '🤐',
  },
  pets: {
    '': '⏭️',
    'Love pets': '🐶',
    Allergic: '🤧',
    'No pets': '🏠',
    'Open to pets': '🐾',
    'Prefer not to say': '🤐',
  },
  religion: {
    '': '⏭️',
    'Very important': '🙏',
    'Somewhat important': '✨',
    'Spiritual not religious': '🕯️',
    'Not important': '💭',
    'Prefer not to say': '🤐',
  },
  political: {
    '': '⏭️',
    'Very important': '🗳️',
    'Somewhat important': '📢',
    'Prefer not political': '🤫',
    'Not important': '💭',
    'Prefer not to say': '🤐',
  },
  workLifeBalance: {
    '': '⏭️',
    'Career-focused': '💼',
    Balanced: '⚖️',
    'Life-first': '🌴',
    Flexible: '🔄',
    'Prefer not to say': '🤐',
  },
  worksOut: {
    '': '⏭️',
    Daily: '🏋️',
    Often: '💪',
    Sometimes: '🚶',
    Rarely: '🛋️',
    'Prefer not to say': '🤐',
  },
};

/** Picker/dropdown row text (no emoji) — fits Android spinner width; API values unchanged. */
export function lifestylePickerDropdownLabel(field: LifestyleFieldKey, value: string): string {
  if (!value) return 'Skip for now';
  const byField: Record<LifestyleFieldKey, Record<string, string>> = {
    smoking: {
      'Non-smoker': 'Non-smoker',
      'Social smoker': 'Sometimes / socially',
      Smoker: 'Regular smoker',
      'Trying to quit': 'Trying to quit',
      'Prefer not to say': 'Prefer not to say',
    },
    drinking: {
      'Non-drinker': 'Rarely or never',
      Socially: 'Socially / on occasion',
      Regularly: 'Fairly often',
      'Sober-curious': 'Sober-curious',
      'Prefer not to say': 'Prefer not to say',
    },
    children: {
      'Want kids': 'Want kids someday',
      'Don’t want kids': 'Don’t want kids',
      'Open to either': 'Open to either',
      'Have kids': 'Already have kids',
      'Prefer not to say': 'Prefer not to say',
    },
    pets: {
      'Love pets': 'Love animals',
      Allergic: 'Pet allergies',
      'No pets': 'Prefer a pet-free home',
      'Open to pets': 'Open to pets',
      'Prefer not to say': 'Prefer not to say',
    },
    religion: {
      'Very important': 'Very important to me',
      'Somewhat important': 'Somewhat important',
      'Spiritual not religious': 'Spiritual, not religious',
      'Not important': 'Not a focus',
      'Prefer not to say': 'Prefer not to say',
    },
    political: {
      'Very important': 'Very important to me',
      'Somewhat important': 'Somewhat important',
      'Prefer not political': 'Keep politics private',
      'Not important': 'Not a focus',
      'Prefer not to say': 'Prefer not to say',
    },
    workLifeBalance: {
      'Career-focused': 'Career-forward',
      Balanced: 'Pretty balanced',
      'Life-first': 'Life-first',
      Flexible: 'It varies',
      'Prefer not to say': 'Prefer not to say',
    },
    worksOut: {
      Daily: 'Most days',
      Often: 'Several times a week',
      Sometimes: 'Sometimes',
      Rarely: 'Rarely',
      'Prefer not to say': 'Prefer not to say',
    },
  };
  return byField[field]?.[value] ?? value;
}

/** Chip / summary labels with emoji for selected lifestyle answers. */
export function lifestylePickerItemLabel(field: LifestyleFieldKey, value: string): string {
  const emoji = LIFESTYLE_VALUE_EMOJI[field][value] ?? LIFESTYLE_FIELD_EMOJI[field];
  if (!value) return `${emoji} Skip for now`;
  const byField: Record<LifestyleFieldKey, Record<string, string>> = {
    smoking: {
      'Non-smoker': 'Non-smoker',
      'Social smoker': 'Sometimes / socially',
      Smoker: 'Regular smoker',
      'Trying to quit': 'Trying to quit',
      'Prefer not to say': 'Prefer not to say',
    },
    drinking: {
      'Non-drinker': 'Rarely or never',
      Socially: 'Socially / on occasion',
      Regularly: 'Fairly often',
      'Sober-curious': 'Sober-curious',
      'Prefer not to say': 'Prefer not to say',
    },
    children: {
      'Want kids': 'Want kids someday',
      'Don’t want kids': 'Don’t want kids',
      'Open to either': 'Open to either',
      'Have kids': 'Already have kids',
      'Prefer not to say': 'Prefer not to say',
    },
    pets: {
      'Love pets': 'Love animals',
      Allergic: 'Pet allergies',
      'No pets': 'Prefer a pet-free home',
      'Open to pets': 'Open to pets',
      'Prefer not to say': 'Prefer not to say',
    },
    religion: {
      'Very important': 'Very important to me',
      'Somewhat important': 'Somewhat important',
      'Spiritual not religious': 'Spiritual, not religious',
      'Not important': 'Not a focus',
      'Prefer not to say': 'Prefer not to say',
    },
    political: {
      'Very important': 'Very important to me',
      'Somewhat important': 'Somewhat important',
      'Prefer not political': 'Prefer to keep politics private',
      'Not important': 'Not a focus',
      'Prefer not to say': 'Prefer not to say',
    },
    workLifeBalance: {
      'Career-focused': 'Career-forward right now',
      Balanced: 'Pretty balanced',
      'Life-first': 'Life-first / flexibility matters',
      Flexible: 'It varies',
      'Prefer not to say': 'Prefer not to say',
    },
    worksOut: {
      Daily: 'Most days',
      Often: 'Several times a week',
      Sometimes: 'Sometimes',
      Rarely: 'Rarely',
      'Prefer not to say': 'Prefer not to say',
    },
  };
  const text = byField[field]?.[value] ?? value;
  return `${emoji} ${text}`;
}

/** Emoji + label for lifestyle option chips (create-profile UI). */
export function lifestyleOptionParts(
  field: LifestyleFieldKey,
  value: string
): { emoji: string; text: string; isSkip: boolean } {
  const isSkip = !value;
  return {
    isSkip,
    emoji: isSkip ? '⏭️' : (LIFESTYLE_VALUE_EMOJI[field][value] ?? LIFESTYLE_FIELD_EMOJI[field]),
    text: lifestylePickerDropdownLabel(field, value),
  };
}

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
