/**
 * Interest overlap for ranking (browse uses aggregated interests_list from SQL;
 * weekly matching uses per-row interests via DB — same math, different inputs).
 */

export function interestNamesFromAggregate(interestsList: string | null | undefined): string[] {
  if (interestsList == null || !String(interestsList).trim()) return [];
  return String(interestsList)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function interestSimilarityFromNames(
  userInterestLowercased: Set<string>,
  candidateNames: string[]
): { sharedCount: number; jaccard: number; dice: number; blend01: number } {
  const cand = new Set(candidateNames);
  let shared = 0;
  for (const n of userInterestLowercased) {
    if (cand.has(n)) shared += 1;
  }
  const uSize = userInterestLowercased.size;
  const cSize = cand.size;
  if (uSize === 0 && cSize === 0) {
    return { sharedCount: 0, jaccard: 0.5, dice: 0.5, blend01: 0.5 };
  }
  const union = new Set([...userInterestLowercased, ...cand]).size;
  const jaccard = union > 0 ? shared / union : 0;
  const sumSizes = uSize + cSize;
  const dice = sumSizes > 0 ? (2 * shared) / sumSizes : 0;
  // Dice favors “how much of our lists overlap”; blend with Jaccard for stability
  const blend01 = Math.min(1, jaccard * 0.4 + dice * 0.6);
  return { sharedCount: shared, jaccard, dice, blend01 };
}
