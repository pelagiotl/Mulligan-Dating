import { db } from "../database.js";

/**
 * Calculate profile completeness score (0-1)
 * More complete profiles get slight boost in matching
 */

interface ProfileData {
  bio: string | null;
  photo_url: string | null;
  looking_for: string | null;
  location: string | null;
}

interface CompletenessData {
  profile: ProfileData;
  interestsCount: number;
  partnerQualitiesCount: number;
  lifestyleComplete: boolean;
}

/**
 * Calculate completeness score for a profile
 * Returns score 0-1 (1 = fully complete)
 */
export async function calculateCompleteness(profileId: string): Promise<number> {
  // Get profile data
  const profileResult = db
    .prepare("SELECT bio, photo_url, looking_for, location FROM profiles WHERE id = ?")
    .get([profileId]);
  const profile = (profileResult instanceof Promise
    ? await profileResult
    : profileResult) as ProfileData | undefined;

  if (!profile) {
    return 0; // No profile
  }

  // Count interests
  const interestsResult = db
    .prepare("SELECT COUNT(*) as count FROM interests WHERE profile_id = ?")
    .get([profileId]);
  const interests = (interestsResult instanceof Promise
    ? await interestsResult
    : interestsResult) as { count: number } | undefined;
  const interestsCount = interests?.count || 0;

  // Calculate completeness score (intentional connections: profile basics + interests)
  let score = 0;
  let maxScore = 0;

  // Basic info (40%)
  maxScore += 0.4;
  if (profile.bio && profile.bio.trim().length > 20) score += 0.15;
  if (profile.photo_url) score += 0.15;
  if (profile.location) score += 0.1;

  // Interests (60%)
  maxScore += 0.6;
  if (interestsCount >= 5) score += 0.6;
  else if (interestsCount >= 3) score += 0.4;
  else if (interestsCount >= 1) score += 0.25;

  // Normalize to 0-1
  return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
}

/**
 * Get completeness boost for matching
 * Returns multiplier (1.0 to 1.15) - complete profiles get 15% boost
 */
export async function getCompletenessBoost(profileId: string): Promise<number> {
  const completeness = await calculateCompleteness(profileId);
  // Linear boost: 0% at 0 completeness, 15% at 100% completeness
  return 1.0 + (completeness * 0.15);
}










