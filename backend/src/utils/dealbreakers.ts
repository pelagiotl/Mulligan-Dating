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
 * Dealbreaker semantics: each dealbreaker means "I don't want to match with people who [X]".
 * We EXCLUDE a candidate when their lifestyle/interests match that description.
 *
 * Examples:
 * - "Doesn't like pets" → exclude only if candidate's lifestyle is "Doesn't like pets" (not if they love pets).
 * - "Wants children" → exclude if candidate "Doesn't want children" (user wants someone who wants kids).
 * - "Doesn't want children" → exclude if candidate "Doesn't want children" (user wants someone open to/wants kids).
 * - "Religious" → exclude if candidate is religious/spiritual (user doesn't want religious partners).
 * - "Not religious" → exclude if candidate is not religious/atheist/agnostic (user wants religious partners).
 */
export async function checkDealbreakers(userProfileId: string, candidateProfileId: string): Promise<boolean> {
  // Get user's dealbreakers
  const userDealbreakersResult = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all([userProfileId]);
  const userDealbreakers = (userDealbreakersResult instanceof Promise
    ? await userDealbreakersResult
    : userDealbreakersResult) as { description: string }[];

  if (userDealbreakers.length === 0) {
    return true; // No dealbreakers, always pass
  }

  // Get candidate's profile info
  const candidateProfileResult = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get([candidateProfileId]);
  const candidateProfile = (candidateProfileResult instanceof Promise
    ? await candidateProfileResult
    : candidateProfileResult) as ProfileRow | undefined;

  if (!candidateProfile) {
    return false; // Can't check, exclude to be safe
  }

  // Get candidate's interests, dealbreakers, and lifestyle
  const candidateInterestsResult = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all([candidateProfileId]);
  const candidateInterests = (candidateInterestsResult instanceof Promise
    ? await candidateInterestsResult
    : candidateInterestsResult) as { name: string }[];
  
  // Ensure candidateInterests is always an array
  const candidateInterestsArray = Array.isArray(candidateInterests) ? candidateInterests : [];

  const candidateDealbreakersResult = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all([candidateProfileId]);
  const candidateDealbreakers = (candidateDealbreakersResult instanceof Promise
    ? await candidateDealbreakersResult
    : candidateDealbreakersResult) as { description: string }[];
  
  // Ensure candidateDealbreakers is always an array
  const candidateDealbreakersArray = Array.isArray(candidateDealbreakers) ? candidateDealbreakers : [];

  const candidateLifestyleResult = db
    .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
    .get([candidateProfileId]);
  const candidateLifestyle = (candidateLifestyleResult instanceof Promise
    ? await candidateLifestyleResult
    : candidateLifestyleResult) as {
      smoking: string | null;
      drinking: string | null;
      children: string | null;
      pets: string | null;
      religion: string | null;
      work_life_balance: string | null;
      works_out: string | null;
    } | undefined;

  // Build candidate text for keyword matching (fallback)
  const candidateInterestsText = candidateInterestsArray.map((i: { name: string }) => i.name).join(' ');
  const candidateText = `${candidateProfile.bio || ''} ${candidateProfile.display_name || ''} ${candidateProfile.location || ''} ${candidateInterestsText}`.toLowerCase();

  // Check each of the user's dealbreakers
  for (const dealbreaker of userDealbreakers) {
    const dealbreakerLower = dealbreaker.description.toLowerCase();

    // Method 1: Check if candidate has this as their own dealbreaker (they also don't want it)
    // This is a positive signal - they're aligned, so we can include them
    const candidateHasSameDealbreaker = candidateDealbreakersArray.some(
      (db: { description: string }) => db.description.toLowerCase() === dealbreakerLower
    );
    if (candidateHasSameDealbreaker) {
      continue; // They share the same dealbreaker, so it's not a problem
    }

    // Method 2: Check lifestyle data (MOST ACCURATE)
    // Semantics: user's dealbreaker = "I don't want to match with people who [X]" → exclude candidate if candidate is X
    if (candidateLifestyle) {
      // Smokes cigarettes = exclude when candidate smokes cigarettes (or both)
      if (dealbreakerLower === 'smokes cigarettes' && candidateLifestyle.smoking) {
        const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
        if (candidateSmoking === 'smokes cigarettes' || candidateSmoking === 'both') {
          return false; // Candidate smokes cigarettes, exclude them
        }
      }

      // Marijuana = exclude when candidate uses marijuana (or both)
      if (dealbreakerLower === 'marijuana' && candidateLifestyle.smoking) {
        const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
        if (candidateSmoking === 'uses marijuana' || candidateSmoking === 'both') {
          return false; // Candidate uses marijuana, exclude them
        }
      }

      // Frequent drinking = exclude when candidate drinks frequently (social drinker or frequently; no "frequently" in app UI, so social drinker is used)
      if (dealbreakerLower === 'frequent drinking' && candidateLifestyle.drinking) {
        const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
        if (candidateDrinking === 'social drinker' || candidateDrinking === 'frequently') {
          return false; // Candidate drinks frequently, exclude them
        }
      }

      // Drinks alcohol = exclude when candidate drinks at all (any level)
      if (dealbreakerLower === 'drinks alcohol' && candidateLifestyle.drinking) {
        const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
        if (candidateDrinking === 'social drinker' || candidateDrinking === 'occasionally' || candidateDrinking === 'frequently') {
          return false; // Candidate drinks alcohol, exclude them
        }
      }

      // Doesn't want children = "I don't want someone who doesn't want children" → exclude only if candidate has "Doesn't want children"
      if (dealbreakerLower === "doesn't want children" && candidateLifestyle.children) {
        const candidateChildren = candidateLifestyle.children.toLowerCase();
        if (candidateChildren === "doesn't want children") {
          return false; // Candidate doesn't want children, exclude them
        }
      }
      // Wants children = "I don't want someone who doesn't want children" → exclude if candidate doesn't want children
      if (dealbreakerLower === 'wants children' && candidateLifestyle.children) {
        const candidateChildren = candidateLifestyle.children.toLowerCase();
        if (candidateChildren === "doesn't want children") {
          return false; // Candidate doesn't want children, exclude them
        }
      }

      // Doesn't like pets dealbreaker = "I don't want someone who doesn't like pets"
      // Exclude only candidates whose lifestyle is "Doesn't like pets" (not people who love/have pets)
      if (dealbreakerLower === "doesn't like pets" && candidateLifestyle.pets) {
        const candidatePets = candidateLifestyle.pets.toLowerCase();
        if (candidatePets === "doesn't like pets") {
          return false; // Candidate doesn't like pets, exclude them
        }
      }

      // Allergic to pets = "I'm allergic, don't want someone with pets" → exclude when candidate has pets (or loves pets, as they may get pets)
      if (dealbreakerLower === 'allergic to pets' && candidateLifestyle.pets) {
        const candidatePets = candidateLifestyle.pets.toLowerCase();
        if (candidatePets === 'has pets' || candidatePets === 'loves pets') {
          return false; // Candidate has or likely has pets, exclude them
        }
      }

      // Religious = "I don't want religious partners" → exclude when candidate is religious or spiritual
      if (dealbreakerLower === 'religious' && candidateLifestyle.religion) {
        const candidateReligion = candidateLifestyle.religion.toLowerCase();
        if (candidateReligion === 'religious' || candidateReligion === 'spiritual') {
          return false; // Candidate is religious/spiritual, exclude them
        }
      }
      // Not religious = "I don't want non-religious partners" → exclude when candidate is not religious
      if (dealbreakerLower === 'not religious' && candidateLifestyle.religion) {
        const candidateReligion = candidateLifestyle.religion.toLowerCase();
        if (candidateReligion === 'not religious' || candidateReligion === 'atheist' || candidateReligion === 'agnostic') {
          return false; // Candidate is not religious, exclude them
        }
      }

      // Workaholic = exclude when candidate is a workaholic
      if (dealbreakerLower === 'workaholic' && candidateLifestyle.work_life_balance) {
        const candidateBalance = candidateLifestyle.work_life_balance.toLowerCase();
        if (candidateBalance === 'workaholic') {
          return false; // Candidate is a workaholic, exclude them
        }
      }
      // Drug use = no lifestyle field in app; handled by Method 3 (interests) or Method 4 (keyword in bio) if needed
    }

    // Method 3: Check if dealbreaker appears in candidate's interests (for lifestyle dealbreakers)
    // For example: "Smoking" in interests means they smoke
    const candidateHasInInterests = candidateInterestsArray.some(
      (i: { name: string }) => i.name.toLowerCase() === dealbreakerLower
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









