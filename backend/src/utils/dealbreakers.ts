import { db } from "../database.js";

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  photo_url: string | null;
  looking_for: string | null;
}

/**
 * Comprehensive dealbreaker checking function
 * Uses multiple methods to accurately detect dealbreakers:
 * 1. Checks if candidate has same dealbreaker (aligned, not a problem)
 * 2. Checks lifestyle data (most accurate)
 * 3. Checks interests
 * 4. Keyword matching in profile text (fallback)
 */
export async function checkDealbreakers(userProfileId: string, candidateProfileId: string): Promise<boolean> {
  // Get user's dealbreakers
  const userDealbreakers = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all(userProfileId) as { description: string }[];

  if (userDealbreakers.length === 0) {
    return true; // No dealbreakers, always pass
  }

  // Get candidate's profile info
  const candidateProfile = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(candidateProfileId) as ProfileRow | undefined;

  if (!candidateProfile) {
    return false; // Can't check, exclude to be safe
  }

  // Get candidate's interests, dealbreakers, and lifestyle
  const candidateInterests = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all(candidateProfileId) as { name: string }[];

  const candidateDealbreakers = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all(candidateProfileId) as { description: string }[];

  const candidateLifestyle = db
    .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
    .get(candidateProfileId) as {
      smoking: string | null;
      drinking: string | null;
      children: string | null;
      pets: string | null;
      religion: string | null;
      work_life_balance: string | null;
    } | undefined;

  // Build candidate text for keyword matching (fallback)
  const candidateInterestsText = candidateInterestsArray.map(i => i.name).join(' ');
  const candidateText = `${candidateProfile.bio || ''} ${candidateProfile.display_name || ''} ${candidateProfile.location || ''} ${candidateInterestsText}`.toLowerCase();

  // Check each of the user's dealbreakers
  for (const dealbreaker of userDealbreakers) {
    const dealbreakerLower = dealbreaker.description.toLowerCase();

    // Method 1: Check if candidate has this as their own dealbreaker (they also don't want it)
    // This is a positive signal - they're aligned, so we can include them
    const candidateHasSameDealbreaker = candidateDealbreakers.some(
      db => db.description.toLowerCase() === dealbreakerLower
    );
    if (candidateHasSameDealbreaker) {
      continue; // They share the same dealbreaker, so it's not a problem
    }

    // Method 2: Check lifestyle data (MOST ACCURATE)
    if (candidateLifestyle) {
      // Smokes cigarettes dealbreaker
      if (dealbreakerLower === 'smokes cigarettes' && candidateLifestyle.smoking) {
        const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
        if (candidateSmoking === 'smokes cigarettes' || candidateSmoking === 'both') {
          return false; // Candidate smokes cigarettes, exclude them
        }
      }

      // Marijuana dealbreaker
      if (dealbreakerLower === 'marijuana' && candidateLifestyle.smoking) {
        const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
        if (candidateSmoking === 'uses marijuana' || candidateSmoking === 'both') {
          return false; // Candidate uses marijuana, exclude them
        }
      }

      // Frequent drinking dealbreaker
      if (dealbreakerLower === 'frequent drinking' && candidateLifestyle.drinking) {
        const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
        if (candidateDrinking === 'social drinker' || candidateDrinking === 'frequently') {
          return false; // Candidate drinks frequently, exclude them
        }
      }

      // Drinks alcohol dealbreaker
      if (dealbreakerLower === 'drinks alcohol' && candidateLifestyle.drinking) {
        const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
        if (candidateDrinking === 'social drinker' || candidateDrinking === 'occasionally' || candidateDrinking === 'frequently') {
          return false; // Candidate drinks alcohol, exclude them
        }
      }

      // Doesn't want children / Wants children dealbreakers
      if (dealbreakerLower === "doesn't want children" && candidateLifestyle.children) {
        const candidateChildren = candidateLifestyle.children.toLowerCase();
        if (candidateChildren === 'wants children' || candidateChildren === 'has children') {
          return false; // Candidate wants/has children, exclude them
        }
      }
      if (dealbreakerLower === 'wants children' && candidateLifestyle.children) {
        const candidateChildren = candidateLifestyle.children.toLowerCase();
        if (candidateChildren === "doesn't want children") {
          return false; // Candidate doesn't want children, exclude them
        }
      }

      // Doesn't like pets dealbreaker
      if (dealbreakerLower === "doesn't like pets" && candidateLifestyle.pets) {
        const candidatePets = candidateLifestyle.pets.toLowerCase();
        if (candidatePets === 'loves pets' || candidatePets === 'has pets') {
          return false; // Candidate loves/has pets, exclude them
        }
      }

      // Allergic to pets dealbreaker
      if (dealbreakerLower === 'allergic to pets' && candidateLifestyle.pets) {
        const candidatePets = candidateLifestyle.pets.toLowerCase();
        if (candidatePets === 'has pets') {
          return false; // Candidate has pets, exclude them
        }
      }

      // Religious / Not religious dealbreakers
      if (dealbreakerLower === 'religious' && candidateLifestyle.religion) {
        const candidateReligion = candidateLifestyle.religion.toLowerCase();
        if (candidateReligion === 'not religious' || candidateReligion === 'atheist' || candidateReligion === 'agnostic') {
          return false; // Candidate is not religious, exclude them
        }
      }
      if (dealbreakerLower === 'not religious' && candidateLifestyle.religion) {
        const candidateReligion = candidateLifestyle.religion.toLowerCase();
        if (candidateReligion === 'religious' || candidateReligion === 'spiritual') {
          return false; // Candidate is religious, exclude them
        }
      }

      // Workaholic dealbreaker
      if (dealbreakerLower === 'workaholic' && candidateLifestyle.work_life_balance) {
        const candidateBalance = candidateLifestyle.work_life_balance.toLowerCase();
        if (candidateBalance === 'workaholic') {
          return false; // Candidate is a workaholic, exclude them
        }
      }
    }

    // Method 3: Check if dealbreaker appears in candidate's interests (for lifestyle dealbreakers)
    // For example: "Smoking" in interests means they smoke
    const candidateHasInInterests = candidateInterestsArray.some(
      i => i.name.toLowerCase() === dealbreakerLower
    );
    if (candidateHasInInterests) {
      return false; // Candidate has this trait, exclude them
    }

    // Method 4: Keyword matching in profile text (bio, name, location) - fallback
    // Split dealbreaker into keywords and check if they appear
    const keywords = dealbreakerLower.split(/\s+/).filter(k => k.length > 2);
    if (keywords.length > 0 && keywords.some(keyword => candidateText.includes(keyword))) {
      // Additional check: make sure it's not a false positive
      // For example, "smoking" in "non-smoking" should not match
      const exactMatch = candidateText.includes(dealbreakerLower);
      if (exactMatch || keywords.every(k => candidateText.includes(k))) {
        // Double-check for negations (e.g., "non-smoking", "doesn't smoke")
        const negationPatterns = ['non-', "doesn't", "don't", "won't", "not ", "never ", "no "];
        const hasNegation = negationPatterns.some(neg => 
          candidateText.includes(neg + dealbreakerLower) || 
          candidateText.includes(neg + keywords[0])
        );
        if (!hasNegation) {
          return false; // Dealbreaker matched, exclude
        }
      }
    }
  }

  return true; // No dealbreakers matched, include
}

