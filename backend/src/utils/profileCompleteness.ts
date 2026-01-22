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

  // Count partner qualities
  const qualitiesResult = db
    .prepare("SELECT COUNT(*) as count FROM partner_qualities WHERE profile_id = ?")
    .get([profileId]);
  const qualities = (qualitiesResult instanceof Promise
    ? await qualitiesResult
    : qualitiesResult) as { count: number } | undefined;
  const qualitiesCount = qualities?.count || 0;

  // Check lifestyle completeness
  const lifestyleResult = db
    .prepare("SELECT smoking, drinking, children, pets, religion, work_life_balance FROM lifestyle WHERE profile_id = ?")
    .get([profileId]);
  const lifestyle = (lifestyleResult instanceof Promise
    ? await lifestyleResult
    : lifestyleResult) as {
      smoking: string | null;
      drinking: string | null;
      children: string | null;
      pets: string | null;
      religion: string | null;
      work_life_balance: string | null;
    } | undefined;

  const lifestyleFields = lifestyle ? [
    lifestyle.smoking,
    lifestyle.drinking,
    lifestyle.children,
    lifestyle.pets,
    lifestyle.religion,
    lifestyle.work_life_balance
  ] : [];
  const lifestyleComplete = lifestyleFields.filter(f => f !== null && f !== '').length >= 4; // At least 4/6 fields

  // Calculate completeness score
  let score = 0;
  let maxScore = 0;

  // Basic info (30%)
  maxScore += 0.3;
  if (profile.bio && profile.bio.trim().length > 20) score += 0.1;
  if (profile.photo_url) score += 0.1;
  if (profile.looking_for) score += 0.05;
  if (profile.location) score += 0.05;

  // Interests (25%)
  maxScore += 0.25;
  if (interestsCount >= 5) score += 0.25;
  else if (interestsCount >= 3) score += 0.15;
  else if (interestsCount >= 1) score += 0.1;

  // Partner qualities (25%)
  maxScore += 0.25;
  if (qualitiesCount >= 5) score += 0.25;
  else if (qualitiesCount >= 3) score += 0.15;
  else if (qualitiesCount >= 1) score += 0.1;

  // Lifestyle (20%)
  maxScore += 0.2;
  if (lifestyleComplete) score += 0.2;
  else if (lifestyleFields.filter(f => f !== null && f !== '').length >= 2) score += 0.1;

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






