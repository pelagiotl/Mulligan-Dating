/**
 * Canonical interest / "what I'm looking for" labels — keep in sync with web
 * `INTEREST_EDIT_OPTIONS` in `frontend/src/pages/MyProfile.tsx`.
 */
export const CANONICAL_INTEREST_OPTION_NAMES = [
  "Travel",
  "Music",
  "Sports",
  "Cooking",
  "Reading",
  "Movies",
  "Fitness",
  "Art",
  "Photography",
  "Dancing",
  "Gaming",
  "Fortnite",
  "Hiking",
  "Yoga",
  "Writing",
  "Technology",
  "Fashion",
  "Animals",
  "Volunteering",
  "Coffee",
  "Nightlife",
  "Comedy",
  "Beach",
  "Camping",
  "Board Games",
  "Tattoos",
  "Meditation",
  "History",
  "Science",
  "Business",
  "Education",
] as const;

const INTEREST_LOWER_TO_CANONICAL = new Map(
  CANONICAL_INTEREST_OPTION_NAMES.map((name) => [name.toLowerCase(), name])
);

/** Normalize user input to the canonical interest string, or null if unknown. */
export function canonicalizeInterestName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return INTEREST_LOWER_TO_CANONICAL.get(t.toLowerCase()) ?? null;
}

/** Webapp dealbreaker chips (lowercase for matching). */
export const CANONICAL_DEALBREAKER_LOWERCASE = new Set([
  "smokes cigarettes",
  "smoking",
  "smokes",
  "marijuana",
  "frequent drinking",
  "heavy drinking",
  "doesn't want children",
  "doesn't want kids",
  "wants children",
  "wants kids",
  "wants kids soon",
  "doesn't workout",
  "doesn't work out",
  "doesn't like pets",
  "drinks alcohol",
  "allergic to pets",
  "religious",
  "not religious",
  "political",
  "workaholic",
]);
