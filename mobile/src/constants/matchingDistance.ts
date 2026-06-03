/** Southern Oregon geo-lock: matching radius cap (miles). */
export const MATCHING_MAX_DISTANCE_MILES = 100;

export const MAX_DISTANCE_SELECT_OPTIONS = [10, 25, 50, 100] as const;

export function clampMaxDistanceMiles(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return MATCHING_MAX_DISTANCE_MILES;
  }
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, MATCHING_MAX_DISTANCE_MILES);
}

export function formatMaxDistanceLabel(value: number | null | undefined): string {
  return `Within ${clampMaxDistanceMiles(value)} mi`;
}
