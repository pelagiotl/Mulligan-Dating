export const SOBER_CIRCLE_LEVELS = [
  { id: 'newly_sober', label: 'Newly Sober', sub: '0–12 months', emoji: '🌱' },
  { id: 'one_year_plus', label: 'One Year+ Sober', sub: '1–5 years', emoji: '🌿' },
  { id: 'five_years_plus', label: 'Five Years+ Sober', sub: '5+ years', emoji: '🌲' },
  { id: 'sober_curious', label: 'Sober-curious / Supportive', sub: 'Exploring or supporting', emoji: '💚' },
] as const;

export type SoberCircleLevelId = (typeof SOBER_CIRCLE_LEVELS)[number]['id'];

export function soberCircleLevelLabel(level: string | null | undefined): string | null {
  const found = SOBER_CIRCLE_LEVELS.find((l) => l.id === level);
  return found ? found.label : null;
}
