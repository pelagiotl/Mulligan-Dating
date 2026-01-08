/**
 * Semantic similarity matching for partner qualities
 * Uses word embeddings-like approach for better matching
 * Example: "adventurous" matches "loves travel", "outdoor activities"
 */

// Semantic groups - qualities that are similar/related
const SEMANTIC_GROUPS: Record<string, string[]> = {
  // Adventure/Outdoor
  'adventurous': ['travel', 'hiking', 'camping', 'outdoor activities', 'exploring', 'sports'],
  'travel': ['adventurous', 'exploring', 'outdoor activities', 'hiking', 'camping'],
  'hiking': ['adventurous', 'outdoor activities', 'camping', 'travel', 'nature'],
  'camping': ['adventurous', 'outdoor activities', 'hiking', 'travel'],
  
  // Creative/Arts
  'creative': ['art', 'painting', 'music', 'writing', 'photography', 'crafts', 'singing'],
  'artistic': ['creative', 'painting', 'photography', 'crafts', 'music'],
  'music': ['creative', 'concerts', 'singing', 'playing instruments'],
  'photography': ['creative', 'art', 'travel'],
  'writing': ['creative', 'reading', 'literature'],
  
  // Intellectual
  'intelligent': ['reading', 'education', 'science', 'history', 'learning', 'podcasts'],
  'educated': ['intelligent', 'reading', 'education', 'learning'],
  'curious': ['reading', 'learning', 'science', 'history', 'podcasts'],
  
  // Social/Active
  'social': ['nightlife', 'concerts', 'comedy', 'board games', 'volunteering'],
  'active': ['sports', 'running', 'cycling', 'swimming', 'tennis', 'yoga', 'fitness'],
  'athletic': ['sports', 'running', 'cycling', 'swimming', 'tennis', 'fitness'],
  
  // Relaxed/Home
  'homebody': ['reading', 'board games', 'cooking', 'coffee', 'netflix', 'relaxing'],
  'relaxed': ['reading', 'coffee', 'meditation', 'yoga', 'homebody'],
  
  // Food/Cooking
  'foodie': ['cooking', 'food', 'restaurants', 'coffee'],
  'cooking': ['foodie', 'food', 'restaurants'],
  
  // Tech/Gaming
  'tech-savvy': ['technology', 'gaming', 'video games', 'board games'],
  'gamer': ['video games', 'board games', 'technology'],
  
  // Spiritual/Wellness
  'spiritual': ['meditation', 'yoga', 'wellness', 'mindfulness'],
  'wellness': ['yoga', 'meditation', 'fitness', 'health'],
  
  // Family/Values
  'family-oriented': ['children', 'family', 'values', 'home'],
  'caring': ['volunteering', 'family', 'pets', 'animals'],
  
  // Career/Ambition
  'ambitious': ['business', 'career', 'education', 'professional'],
  'driven': ['ambitious', 'business', 'career', 'professional'],
};

/**
 * Calculate semantic similarity between two qualities
 * Returns score 0-1 based on how semantically similar they are
 */
export function calculateSemanticSimilarity(quality1: string, quality2: string): number {
  const q1 = quality1.toLowerCase().trim();
  const q2 = quality2.toLowerCase().trim();
  
  // Exact match
  if (q1 === q2) {
    return 1.0;
  }
  
  // Check if one contains the other (partial match)
  if (q1.includes(q2) || q2.includes(q1)) {
    return 0.8;
  }
  
  // Check semantic groups
  for (const [key, group] of Object.entries(SEMANTIC_GROUPS)) {
    const inGroup1 = key === q1 || group.includes(q1);
    const inGroup2 = key === q2 || group.includes(q2);
    
    if (inGroup1 && inGroup2) {
      // Both in same semantic group
      if (key === q1 && key === q2) {
        return 1.0; // Both are the key
      }
      if (group.includes(q1) && group.includes(q2)) {
        return 0.7; // Both in group list
      }
      return 0.6; // One is key, one is in group
    }
    
    // Check if one quality is the key and other is in its group
    if (key === q1 && group.includes(q2)) {
      return 0.75;
    }
    if (key === q2 && group.includes(q1)) {
      return 0.75;
    }
  }
  
  // Word overlap (simple token-based similarity)
  const words1 = q1.split(/\s+/);
  const words2 = q2.split(/\s+/);
  const commonWords = words1.filter(w => w.length > 3 && words2.includes(w));
  
  if (commonWords.length > 0) {
    return 0.5; // Some word overlap
  }
  
  return 0; // No similarity
}

/**
 * Find best semantic match for a quality in a list of candidate qualities
 * Returns the best match score (0-1)
 */
export function findBestSemanticMatch(
  userQuality: string,
  candidateQualities: string[]
): number {
  let bestMatch = 0;
  
  for (const candidateQuality of candidateQualities) {
    const similarity = calculateSemanticSimilarity(userQuality, candidateQuality);
    if (similarity > bestMatch) {
      bestMatch = similarity;
    }
  }
  
  return bestMatch;
}

