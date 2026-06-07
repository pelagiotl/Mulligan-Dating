/**
 * Shared rules for "who I want to see" (preferred_genders JSON on preferences).
 * Empty / missing list = open to all (same as weekly matching).
 */

function normalizeGenderToken(g: string): string {
  if (g === 'Women') return 'Woman';
  if (g === 'Men') return 'Man';
  return g;
}

export function parsePreferredGenders(preferredGendersJson: string | null | undefined): string[] {
  if (preferredGendersJson == null || !String(preferredGendersJson).trim()) return [];
  try {
    const arr = JSON.parse(preferredGendersJson) as unknown;
    if (!Array.isArray(arr)) return [];
    return (arr as string[]).map((g) => normalizeGenderToken(String(g)));
  } catch {
    return [];
  }
}

/** True if this person's preferred_genders include the other person's profile gender. */
export function prefersGender(preferred: string[], otherPersonGender: string): boolean {
  if (!preferred.length) return true;
  if (preferred.includes('Everyone')) return true;
  const g = otherPersonGender || '';
  if (preferred.includes(g)) return true;
  if (g === 'Non-binary' && preferred.includes('Other')) return true;
  return false;
}

/** Both users' gender preferences allow pairing (Connect, browse, weekly matches). */
export function mutualGenderPreferencesMet(
  userGender: string,
  userPreferredGendersJson: string | null | undefined,
  candidateGender: string,
  candidatePreferredGendersJson: string | null | undefined
): boolean {
  const u = parsePreferredGenders(userPreferredGendersJson);
  const c = parsePreferredGenders(candidatePreferredGendersJson);
  return prefersGender(u, candidateGender) && prefersGender(c, userGender);
}
