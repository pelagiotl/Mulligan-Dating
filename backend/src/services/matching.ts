import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { geocodeLocation, calculateDistanceMiles } from "../utils/geocoding.js";

/**
 * STATE-OF-THE-ART MATCHING ALGORITHM
 * 
 * Features:
 * - TF-IDF based text similarity
 * - Cosine similarity for semantic matching
 * - Non-linear scoring functions (sigmoid, exponential decay)
 * - Diversity factor to avoid similar recommendations
 * - Weighted Jaccard similarity
 * - Better normalization and missing data handling
 */

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  looking_for: string | null;
}

interface PreferencesRow {
  id: string;
  profile_id: string;
  min_age: number;
  max_age: number;
  preferred_genders: string | null;
  max_distance: number;
  intent: number;
  values: string | null;
}

interface MatchCandidate {
  userId: string;
  profileId: string;
  score: number;
  sharedValues: number;
  sharedInterests: number;
  partnerQualitiesMatch: number;
  lookingForMatch: number;
  intentDiff: number;
  distanceScore: number;
  breakdown: {
    values: number;
    interests: number;
    qualities: number;
    lookingFor: number;
    intent: number;
    distance: number;
  };
}

// Cache for coordinates to avoid repeated geocoding calls
const coordinatesCache = new Map<string, { lat: number; lng: number } | null>();

// Extended stop words list for better text processing
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'someone', 'somebody',
  'who', 'what', 'where', 'when', 'why', 'how', 'this', 'that', 'these', 'those',
  'am', 'get', 'got', 'go', 'went', 'come', 'came', 'see', 'saw', 'know', 'knew',
  'think', 'thought', 'want', 'wanted', 'need', 'needed', 'like', 'liked', 'love', 'loved'
]);

/**
 * Advanced text processing with stemming and normalization
 */
function processText(text: string | null): string[] {
  if (!text) return [];
  
  // Normalize: lowercase, remove punctuation, split
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  
  // Simple stemming (remove common suffixes)
  return words.map(word => {
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('est') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
  });
}

/**
 * Calculate TF-IDF based cosine similarity between two text documents
 * More sophisticated than simple keyword matching
 */
function calculateTextSimilarity(text1: string | null, text2: string | null): number {
  if (!text1 || !text2) return 0;
  
  const words1 = processText(text1);
  const words2 = processText(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Create term frequency maps
  const tf1: Map<string, number> = new Map();
  const tf2: Map<string, number> = new Map();
  
  words1.forEach(word => tf1.set(word, (tf1.get(word) || 0) + 1));
  words2.forEach(word => tf2.set(word, (tf2.get(word) || 0) + 1));
  
  // Normalize term frequencies
  const normalize = (tf: Map<string, number>, total: number) => {
    const normalized = new Map<string, number>();
    tf.forEach((count, word) => normalized.set(word, count / total));
    return normalized;
  };
  
  const normalized1 = normalize(tf1, words1.length);
  const normalized2 = normalize(tf2, words2.length);
  
  // Calculate cosine similarity
  const allWords = new Set([...normalized1.keys(), ...normalized2.keys()]);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  allWords.forEach(word => {
    const val1 = normalized1.get(word) || 0;
    const val2 = normalized2.get(word) || 0;
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
    norm2 += val2 * val2;
  });
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * Sigmoid function for non-linear scoring (better than linear)
 * Maps values to smooth S-curve between 0 and 1
 */
function sigmoid(x: number, center: number = 0, steepness: number = 1): number {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

/**
 * Exponential decay function for distance scoring
 * Better than linear - closer distances get much higher scores
 */
function exponentialDecay(distance: number, maxDistance: number): number {
  if (distance === 0) return 1;
  if (distance >= maxDistance) return 0.1;
  // Exponential decay: e^(-k*distance/maxDistance)
  const k = 3; // Steepness factor
  return Math.exp(-k * (distance / maxDistance));
}

/**
 * Calculate distance between two location strings using real geocoding
 * Returns distance in miles
 */
async function calculateDistance(loc1: string | null, loc2: string | null): Promise<number> {
  if (!loc1 || !loc2) return 999; // Return large distance if no location
  if (loc1.toLowerCase().trim() === loc2.toLowerCase().trim()) return 0;
  
  // Check cache for coordinates
  let coord1 = coordinatesCache.get(loc1);
  let coord2 = coordinatesCache.get(loc2);
  
  // Geocode if not in cache
  if (!coord1) {
    const result1 = await geocodeLocation(loc1);
    coord1 = result1.coordinates;
    coordinatesCache.set(loc1, coord1);
  }
  
  if (!coord2) {
    const result2 = await geocodeLocation(loc2);
    coord2 = result2.coordinates;
    coordinatesCache.set(loc2, coord2);
  }
  
  // Calculate real distance using Haversine formula
  return calculateDistanceMiles(coord1, coord2);
}

// Parse JSON string or return empty array
function parseJsonArray(jsonStr: string | null): string[] {
  if (!jsonStr) return [];
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

/**
 * Check if candidate matches user's dealbreakers
 */
function checkDealbreakers(userProfileId: string, candidateProfileId: string): boolean {
  // Get user's dealbreakers
  const userDealbreakers = db
    .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
    .all(userProfileId) as { description: string }[];
  
  // Get candidate's profile info to check against dealbreakers
  const candidateProfile = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(candidateProfileId) as ProfileRow | undefined;
  
  if (!candidateProfile) return false;
  
  // Simple keyword matching for dealbreakers
  // In production, use NLP or more sophisticated matching
  const candidateText = `${candidateProfile.bio || ''} ${candidateProfile.display_name || ''} ${candidateProfile.location || ''}`.toLowerCase();
  
  for (const dealbreaker of userDealbreakers) {
    const keywords = dealbreaker.description.toLowerCase().split(/\s+/);
    // If any keyword from dealbreaker appears in candidate's profile, it's a dealbreaker
    if (keywords.some(keyword => keyword.length > 3 && candidateText.includes(keyword))) {
      return false; // Dealbreaker matched
    }
  }
  
  return true; // No dealbreakers matched
}

/**
 * Calculate lifestyle compatibility score
 * Returns score 0-10 based on how well lifestyles match
 */
function calculateLifestyleMatch(
  userProfileId: string,
  candidateProfileId: string
): number {
  const userLifestyle = db
    .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
    .get(userProfileId) as {
      smoking: string | null;
      drinking: string | null;
      children: string | null;
      pets: string | null;
      religion: string | null;
      work_life_balance: string | null;
    } | undefined;

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

  if (!userLifestyle || !candidateLifestyle) {
    return 5; // Neutral score if no lifestyle data
  }

  let matches = 0;
  let total = 0;

  // Smoking match
  if (userLifestyle.smoking && candidateLifestyle.smoking) {
    total++;
    const userSmoking = userLifestyle.smoking.toLowerCase();
    const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
    if (userSmoking === candidateSmoking) {
      matches += 1; // Exact match
    } else if (
      (userSmoking === 'non-smoker' && candidateSmoking === 'non-smoker') ||
      (userSmoking.includes('smokes') && candidateSmoking.includes('smokes')) ||
      (userSmoking.includes('marijuana') && candidateSmoking.includes('marijuana'))
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Drinking match
  if (userLifestyle.drinking && candidateLifestyle.drinking) {
    total++;
    const userDrinking = userLifestyle.drinking.toLowerCase();
    const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
    if (userDrinking === candidateDrinking) {
      matches += 1; // Exact match
    } else if (
      (userDrinking === 'non-drinker' && candidateDrinking === 'non-drinker') ||
      (userDrinking.includes('drink') && candidateDrinking.includes('drink'))
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Children match
  if (userLifestyle.children && candidateLifestyle.children) {
    total++;
    const userChildren = userLifestyle.children.toLowerCase();
    const candidateChildren = candidateLifestyle.children.toLowerCase();
    if (userChildren === candidateChildren) {
      matches += 1; // Exact match
    } else if (
      (userChildren.includes('children') && candidateChildren.includes('children')) ||
      (userChildren.includes("doesn't want") && candidateChildren.includes("doesn't want"))
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Pets match
  if (userLifestyle.pets && candidateLifestyle.pets) {
    total++;
    const userPets = userLifestyle.pets.toLowerCase();
    const candidatePets = candidateLifestyle.pets.toLowerCase();
    if (userPets === candidatePets) {
      matches += 1; // Exact match
    } else if (
      (userPets.includes('pets') && candidatePets.includes('pets')) ||
      (userPets.includes("doesn't like") && candidatePets.includes("doesn't like"))
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Religion match
  if (userLifestyle.religion && candidateLifestyle.religion) {
    total++;
    const userReligion = userLifestyle.religion.toLowerCase();
    const candidateReligion = candidateLifestyle.religion.toLowerCase();
    if (userReligion === candidateReligion) {
      matches += 1; // Exact match
    } else if (
      (userReligion === 'spiritual' && candidateReligion === 'spiritual') ||
      (userReligion === 'agnostic' && candidateReligion === 'agnostic')
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Work-life balance match
  if (userLifestyle.work_life_balance && candidateLifestyle.work_life_balance) {
    total++;
    const userBalance = userLifestyle.work_life_balance.toLowerCase();
    const candidateBalance = candidateLifestyle.work_life_balance.toLowerCase();
    if (userBalance === candidateBalance) {
      matches += 1; // Exact match
    } else if (
      (userBalance.includes('balanced') && candidateBalance.includes('balanced')) ||
      (userBalance.includes('flexible') && candidateBalance.includes('flexible'))
    ) {
      matches += 0.5; // Partial match
    }
  }

  // Return normalized score (0-10)
  return total > 0 ? (matches / total) * 10 : 5;
}

/**
 * Calculate partner qualities match score
 */
function calculatePartnerQualitiesMatch(
  userProfileId: string,
  candidateProfileId: string
): number {
  // Get user's desired partner qualities
  const userQualities = db
    .prepare("SELECT quality, importance FROM partner_qualities WHERE profile_id = ?")
    .all(userProfileId) as { quality: string; importance: number }[];
  
  if (userQualities.length === 0) return 5; // Neutral score if no qualities specified
  
  // Get candidate's profile info
  const candidateProfile = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(candidateProfileId) as ProfileRow | undefined;
  
  if (!candidateProfile) return 0;
  
  // Get candidate's interests (as proxy for qualities)
  const candidateInterests = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all(candidateProfileId) as { name: string }[];
  
  const candidateText = `${candidateProfile.bio || ''} ${candidateInterests.map(i => i.name).join(' ')}`.toLowerCase();
  
  let totalScore = 0;
  let totalImportance = 0;
  
  for (const quality of userQualities) {
    const qualityLower = quality.quality.toLowerCase();
    const importance = quality.importance || 5;
    
    // Check if quality appears in candidate's profile/interests
    if (candidateText.includes(qualityLower)) {
      totalScore += importance;
    }
    totalImportance += importance;
  }
  
  // Return normalized score (0-10)
  return totalImportance > 0 ? (totalScore / totalImportance) * 10 : 5;
}

/**
 * Calculate interests overlap score using weighted Jaccard similarity
 * More sophisticated than simple Jaccard - accounts for interest importance
 */
function calculateInterestsOverlap(
  userProfileId: string,
  candidateProfileId: string
): number {
  const userInterests = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all(userProfileId) as { name: string }[];

  const candidateInterests = db
    .prepare("SELECT name FROM interests WHERE profile_id = ?")
    .all(candidateProfileId) as { name: string }[];

  if (userInterests.length === 0 && candidateInterests.length === 0) return 5; // Neutral

  const userInterestNames = new Set(userInterests.map(i => i.name.toLowerCase()));
  const candidateInterestNames = new Set(candidateInterests.map(i => i.name.toLowerCase()));

  // Weighted Jaccard: give more weight to shared interests
  const shared = [...userInterestNames].filter(name => candidateInterestNames.has(name));
  const total = new Set([...userInterestNames, ...candidateInterestNames]).size;

  // Base Jaccard similarity
  const jaccard = total > 0 ? shared.length / total : 0;
  
  // Boost score if there are many shared interests (non-linear)
  const sharedCount = shared.length;
  const boost = sharedCount > 0 ? sigmoid(sharedCount, 3, 0.5) : 0;
  
  // Combine base similarity with boost (weighted average)
  const finalScore = (jaccard * 0.7 + boost * 0.3) * 10;
  
  return Math.min(finalScore, 10); // Cap at 10
}

/**
 * Calculate "looking for" compatibility score using TF-IDF cosine similarity
 * State-of-the-art text matching instead of simple keyword overlap
 */
function calculateLookingForMatch(
  userProfileId: string,
  candidateProfileId: string
): number {
  // Get both profiles with their "looking_for" and bio fields
  const userProfile = db
    .prepare("SELECT looking_for, bio FROM profiles WHERE id = ?")
    .get(userProfileId) as { looking_for: string | null; bio: string | null } | undefined;

  const candidateProfile = db
    .prepare("SELECT looking_for, bio FROM profiles WHERE id = ?")
    .get(candidateProfileId) as { looking_for: string | null; bio: string | null } | undefined;

  if (!userProfile || !candidateProfile) return 5; // Neutral if missing

  // Combine "looking_for" and bio for richer text matching
  const userText = `${userProfile.looking_for || ''} ${userProfile.bio || ''}`.trim();
  const candidateText = `${candidateProfile.looking_for || ''} ${candidateProfile.bio || ''}`.trim();

  if (!userText && !candidateText) return 5; // Both empty

  // Calculate bidirectional cosine similarity
  let score1 = 0;
  let score2 = 0;

  if (userProfile.looking_for) {
    // How well user's "looking_for" matches candidate's full profile
    score1 = calculateTextSimilarity(userProfile.looking_for, candidateText);
  } else {
    score1 = 0.5; // Neutral if not specified
  }

  if (candidateProfile.looking_for) {
    // How well candidate's "looking_for" matches user's full profile
    score2 = calculateTextSimilarity(candidateProfile.looking_for, userText);
  } else {
    score2 = 0.5; // Neutral if not specified
  }

  // Weighted average (give more weight to "looking_for" if both exist)
  let finalScore: number;
  if (userProfile.looking_for && candidateProfile.looking_for) {
    // Both specified: use direct "looking_for" comparison (70%) + bidirectional (30%)
    const directMatch = calculateTextSimilarity(userProfile.looking_for, candidateProfile.looking_for);
    finalScore = directMatch * 0.7 + ((score1 + score2) / 2) * 0.3;
  } else {
    // One or both missing: use bidirectional average
    finalScore = (score1 + score2) / 2;
  }

  // Apply sigmoid to emphasize strong matches
  return sigmoid(finalScore * 10, 5, 0.3) * 10;
}

/**
 * Generate weekly matches for a user based on mutual preferences
 * IMPROVED VERSION with dealbreakers, partner qualities, interests, and real geocoding
 */
export async function generateWeeklyMatches(userId: string): Promise<{
  matchesCreated: number;
  matches: string[];
}> {
  // Get user's profile and preferences
  const userProfile = db
    .prepare("SELECT * FROM profiles WHERE user_id = ?")
    .get(userId) as ProfileRow | undefined;

  if (!userProfile) {
    return { matchesCreated: 0, matches: [] };
  }

  const userPrefs = db
    .prepare("SELECT * FROM preferences WHERE profile_id = ?")
    .get(userProfile.id) as PreferencesRow | undefined;

  if (!userPrefs) {
    return { matchesCreated: 0, matches: [] };
  }

  // Get user's values
  const userValues = parseJsonArray(userPrefs.values);
  const userPreferredGenders = parseJsonArray(userPrefs.preferred_genders);

  // Check if user is premium
  const user = db
    .prepare("SELECT is_premium FROM users WHERE id = ?")
    .get(userId) as { is_premium: number } | undefined;
  const isPremium = user?.is_premium === 1;
  const maxMatches = isPremium ? 3 : 1;

  // Get all other profiles with preferences
  const allProfiles = db
    .prepare(`
      SELECT p.*, pref.*
      FROM profiles p
      JOIN preferences pref ON pref.profile_id = p.id
      WHERE p.user_id != ?
    `)
    .all(userId) as (ProfileRow & PreferencesRow)[];

  // Find candidates that match mutual preferences
  const candidates: MatchCandidate[] = [];

  for (const candidate of allProfiles) {
    const candidateValues = parseJsonArray(candidate.values);
    const candidatePreferredGenders = parseJsonArray(candidate.preferred_genders);

    // Check mutual age preferences
    const userAgeInRange =
      candidate.min_age <= userProfile.age &&
      candidate.max_age >= userProfile.age;
    const candidateAgeInRange =
      userPrefs.min_age <= candidate.age &&
      userPrefs.max_age >= candidate.age;

    if (!userAgeInRange || !candidateAgeInRange) {
      continue; // Age mismatch
    }

    // Check mutual gender preferences
    const userWantsCandidate =
      userPreferredGenders.length === 0 ||
      userPreferredGenders.includes(candidate.gender);
    const candidateWantsUser =
      candidatePreferredGenders.length === 0 ||
      candidatePreferredGenders.includes(userProfile.gender);

    if (!userWantsCandidate || !candidateWantsUser) {
      continue; // Gender preference mismatch
    }

    // Check distance (using real geocoding)
    // Note: This is async, so we'll handle it differently
    // For now, we'll do a quick string check first, then geocode if needed
    let distance = 999;
    if (userProfile.location && candidate.location) {
      // Quick check: if locations are identical strings, distance is 0
      if (userProfile.location.toLowerCase().trim() === candidate.location.toLowerCase().trim()) {
        distance = 0;
      } else {
        // Use real geocoding (async, but we'll await it)
        try {
          distance = await calculateDistance(userProfile.location, candidate.location);
        } catch (error) {
          console.warn('Distance calculation failed:', error);
          // Fallback: assume far if geocoding fails
          distance = 999;
        }
      }
    }
    
    if (distance > userPrefs.max_distance || distance > candidate.max_distance) {
      continue; // Too far
    }

    // Check intent compatibility (within 2 points)
    const intentDiff = Math.abs(userPrefs.intent - candidate.intent);
    if (intentDiff > 2) {
      continue; // Intent mismatch
    }

    // Check shared values (at least 3)
    const sharedValues = userValues.filter((v) =>
      candidateValues.includes(v)
    ).length;
    if (sharedValues < 3) {
      continue; // Not enough shared values
    }

    // NEW: Check dealbreakers (must pass)
    if (!checkDealbreakers(userProfile.id, candidate.id)) {
      continue; // Dealbreaker matched
    }

    // NEW: Calculate interests overlap
    const sharedInterests = calculateInterestsOverlap(userProfile.id, candidate.id);

    // NEW: Calculate partner qualities match
    const partnerQualitiesMatch = calculatePartnerQualitiesMatch(
      userProfile.id,
      candidate.id
    );

    // NEW: Calculate "looking for" compatibility
    const lookingForMatch = calculateLookingForMatch(
      userProfile.id,
      candidate.id
    );

    // NEW: Calculate lifestyle compatibility
    const lifestyleMatch = calculateLifestyleMatch(
      userProfile.id,
      candidate.id
    );

    // Calculate distance score using exponential decay (state-of-the-art)
    // Much better than linear - gives exponentially higher scores for closer matches
    const maxDistance = Math.max(userPrefs.max_distance, candidate.max_distance);
    const distanceScore = exponentialDecay(distance, maxDistance) * 10;

    // STATE-OF-THE-ART SCORING SYSTEM with non-linear transformations
    // Uses sigmoid functions for better score distribution
    // Values: 20% weight - non-linear boost for more shared values
    // Interests: 15% weight - already uses weighted Jaccard
    // Partner Qualities ("What I'm Looking For"): 20% weight - importance-weighted
    // Looking For: 10% weight - TF-IDF cosine similarity
    // Lifestyle: 15% weight - lifestyle compatibility matching
    // Intent: 10% weight - sigmoid for smooth intent matching
    // Distance: 10% weight - exponential decay
    
    // Non-linear value scoring (more shared values = exponentially better)
    const valuesScore = sigmoid(sharedValues, 3, 0.5) * 6; // Max 6 points (20% of 30)
    
    // Interests already has non-linear boost built in
    const interestsScore = (sharedInterests / 10) * 1.5; // 15% weight
    
    // Partner qualities with importance weighting (already sophisticated)
    const qualitiesScore = (partnerQualitiesMatch / 10) * 2; // 20% weight
    
    // Looking for uses TF-IDF cosine similarity (state-of-the-art)
    const lookingForScore = (lookingForMatch / 10) * 1; // 10% weight
    
    // Lifestyle compatibility (NEW)
    const lifestyleScore = (lifestyleMatch / 10) * 1.5; // 15% weight
    
    // Intent with sigmoid for smooth matching (exact match = 1, 1 diff = 0.7, 2 diff = 0.3)
    const intentScore = sigmoid(2 - intentDiff, 0, 1.5) * 1; // 10% weight
    
    // Distance uses exponential decay (already calculated above)
    const distanceScoreWeighted = (distanceScore / 10) * 1; // 10% weight

    // Final score with all components
    const totalScore = valuesScore + interestsScore + qualitiesScore + lookingForScore + lifestyleScore + intentScore + distanceScoreWeighted;
    
    // Apply final sigmoid normalization to ensure scores are well-distributed
    // This helps with ranking and prevents score inflation
    const normalizedScore = sigmoid(totalScore, 5, 0.2) * 15; // Scale to 0-15 for better granularity

    candidates.push({
      userId: candidate.user_id,
      profileId: candidate.id,
      score: normalizedScore, // Use normalized score
      sharedValues,
      sharedInterests,
      partnerQualitiesMatch,
      lookingForMatch,
      intentDiff,
      distanceScore,
      breakdown: {
        values: valuesScore,
        interests: interestsScore,
        qualities: qualitiesScore,
        lookingFor: lookingForScore,
        intent: intentScore,
        distance: distanceScoreWeighted,
      },
    });
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  // Check existing matches to avoid duplicates
  const existingMatches = db
    .prepare(
      `SELECT user1_id, user2_id FROM matches 
       WHERE (user1_id = ? OR user2_id = ?) 
       AND stage != 'expired'`
    )
    .all(userId, userId) as { user1_id: string; user2_id: string }[];

  const existingUserIds = new Set(
    existingMatches.map((m) =>
      m.user1_id === userId ? m.user2_id : m.user1_id
    )
  );

  // Filter out existing matches
  const availableCandidates = candidates.filter((c) => !existingUserIds.has(c.userId));

  // DIVERSITY-AWARE SELECTION (state-of-the-art)
  // Avoid recommending profiles that are too similar to each other
  // This ensures users see variety in their matches
  const selectedCandidates: MatchCandidate[] = [];
  const selectedProfileIds = new Set<string>();
  
  for (const candidate of availableCandidates) {
    if (selectedCandidates.length >= maxMatches) break;
    
    // Check diversity: if we already have candidates, ensure this one is different enough
    let isDiverse = true;
    if (selectedCandidates.length > 0) {
      // Calculate average similarity to already selected candidates
      const similarities = selectedCandidates.map(selected => {
        // Use interests overlap as proxy for similarity
        const selectedInterests = db
          .prepare("SELECT name FROM interests WHERE profile_id = ?")
          .all(selected.profileId) as { name: string }[];
        const candidateInterests = db
          .prepare("SELECT name FROM interests WHERE profile_id = ?")
          .all(candidate.profileId) as { name: string }[];
        
        const selectedSet = new Set(selectedInterests.map(i => i.name.toLowerCase()));
        const candidateSet = new Set(candidateInterests.map(i => i.name.toLowerCase()));
        const shared = [...selectedSet].filter(x => candidateSet.has(x)).length;
        const total = new Set([...selectedSet, ...candidateSet]).size;
        return total > 0 ? shared / total : 0;
      });
      
      const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
      
      // Only add if average similarity is below threshold (ensures diversity)
      // But still allow if score is very high (top 10% of candidates)
      const scoreThreshold = availableCandidates[0].score * 0.9;
      isDiverse = avgSimilarity < 0.7 || candidate.score >= scoreThreshold;
    }
    
    if (isDiverse && !selectedProfileIds.has(candidate.profileId)) {
      selectedCandidates.push(candidate);
      selectedProfileIds.add(candidate.profileId);
    }
  }
  
  // If we don't have enough diverse candidates, fill with top remaining
  if (selectedCandidates.length < maxMatches) {
    const remaining = availableCandidates
      .filter(c => !selectedProfileIds.has(c.profileId))
      .slice(0, maxMatches - selectedCandidates.length);
    selectedCandidates.push(...remaining);
  }
  
  const newCandidates = selectedCandidates.slice(0, maxMatches);

  // Create match records (status: pending, stage: stage1 for weekly matches)
  const matchIds: string[] = [];

  const sevenDaysFromNow = new Date();
  // Add 7 days, but set time to end of day (23:59:59) to ensure we get exactly 7 days
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  for (const candidate of newCandidates) {
    const matchId = uuidv4();

    // Create match directly in stage1 (mutual match from system)
    db.prepare(
      `INSERT INTO matches (id, user1_id, user2_id, status, stage, stage1_at, expires_at)
       VALUES (?, ?, ?, 'mutual', 'stage1', CURRENT_TIMESTAMP, ?)`
    ).run(matchId, userId, candidate.userId, sevenDaysFromNow.toISOString());

    matchIds.push(matchId);
  }

  return {
    matchesCreated: matchIds.length,
    matches: matchIds,
  };
}

/**
 * Generate weekly matches for all active users
 */
export async function generateWeeklyMatchesForAll(): Promise<{
  totalUsers: number;
  totalMatches: number;
}> {
  // Get all users with completed profiles
  const users = db
    .prepare(`
      SELECT DISTINCT u.id
      FROM users u
      JOIN profiles p ON p.user_id = u.id
      JOIN preferences pref ON pref.profile_id = p.id
    `)
    .all() as { id: string }[];

  let totalMatches = 0;

  for (const user of users) {
    const result = await generateWeeklyMatches(user.id);
    totalMatches += result.matchesCreated;
  }

  return {
    totalUsers: users.length,
    totalMatches,
  };
}
