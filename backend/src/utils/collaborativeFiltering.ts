import { db } from "../database.js";
import { getSuccessfulMatches } from "./successTracking.js";

/**
 * Collaborative filtering: "Users like you also matched with..."
 * Finds users with similar successful match patterns and recommends profiles they matched with
 */

/**
 * Find similar users based on successful match patterns
 * Returns array of user IDs with similarity scores
 */
export async function findSimilarUsers(
  userId: string,
  limit: number = 20
): Promise<Array<{ userId: string; similarity: number }>> {
  // Get current user's successful matches
  const userSuccessfulMatches = getSuccessfulMatches(userId);
  
  if (userSuccessfulMatches.length === 0) {
    return []; // No successful matches yet
  }

  const userMatchSet = new Set(userSuccessfulMatches);

  // Get all other users' successful matches
  const allSignals = db
    .prepare(`
      SELECT DISTINCT user_id, matched_user_id
      FROM success_signals
      WHERE user_id != ?
      AND signal_type IN ('match_created', 'stage_advanced')
    `)
    .all(userId) as Array<{ user_id: string; matched_user_id: string }>;

  // Group by user_id
  const userMatchMap = new Map<string, Set<string>>();
  
  for (const signal of allSignals) {
    if (!userMatchMap.has(signal.user_id)) {
      userMatchMap.set(signal.user_id, new Set());
    }
    userMatchMap.get(signal.user_id)!.add(signal.matched_user_id);
  }

  // Calculate Jaccard similarity for each user
  const similarities: Array<{ userId: string; similarity: number }> = [];

  for (const [otherUserId, otherMatches] of userMatchMap.entries()) {
    // Calculate intersection and union
    const intersection = [...userMatchSet].filter(id => otherMatches.has(id)).length;
    const union = new Set([...userMatchSet, ...otherMatches]).size;

    // Jaccard similarity
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity > 0.1) { // Only include if at least 10% similar
      similarities.push({ userId: otherUserId, similarity });
    }
  }

  // Sort by similarity and return top N
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Get recommendations based on collaborative filtering
 * Returns candidate IDs that similar users successfully matched with
 */
export async function getCollaborativeRecommendations(
  userId: string,
  excludeIds: string[] = [],
  limit: number = 10
): Promise<string[]> {
  const similarUsers = await findSimilarUsers(userId, 20);
  
  if (similarUsers.length === 0) {
    return []; // No similar users yet
  }

  // Get profiles that similar users successfully matched with (weighted by similarity)
  const recommendations = new Map<string, number>(); // candidate_id -> weighted score

  for (const { userId: similarUserId, similarity } of similarUsers) {
    const successfulMatches = getSuccessfulMatches(similarUserId);

    for (const matchedUserId of successfulMatches) {
      // Skip if already excluded or if current user already matched
      if (excludeIds.includes(matchedUserId)) continue;
      
      // Check if already matched
      const existingMatch = db
        .prepare(`
          SELECT id FROM matches 
          WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
          AND stage != 'expired'
        `)
        .get(userId, matchedUserId, matchedUserId, userId);
      
      if (existingMatch) continue; // Already matched

      // Add weighted score (similarity * success weight)
      const currentScore = recommendations.get(matchedUserId) || 0;
      recommendations.set(matchedUserId, currentScore + similarity);
    }
  }

  // Sort by score and return top N
  return Array.from(recommendations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([candidateId]) => candidateId);
}

