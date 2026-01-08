import { db } from "../database.js";

/**
 * Collaborative filtering: "Users like you also liked..."
 * Finds users with similar swipe patterns and recommends profiles they liked
 */

interface SwipeInteraction {
  user_id: string;
  candidate_id: string;
  action: string;
}

/**
 * Find similar users based on swipe patterns
 * Returns array of user IDs with similarity scores
 */
export async function findSimilarUsers(
  userId: string,
  limit: number = 20
): Promise<Array<{ userId: string; similarity: number }>> {
  // Get current user's swipe history
  const userSwipes = db
    .prepare("SELECT candidate_id, action FROM swipe_interactions WHERE user_id = ?")
    .all(userId) as SwipeInteraction[];

  if (userSwipes.length === 0) {
    return []; // No data yet
  }

  const userLikedIds = new Set(
    userSwipes.filter(s => s.action === 'like').map(s => s.candidate_id)
  );
  const userPassedIds = new Set(
    userSwipes.filter(s => s.action === 'pass').map(s => s.candidate_id)
  );

  // Get all other users' swipe patterns
  const allSwipes = db
    .prepare("SELECT user_id, candidate_id, action FROM swipe_interactions WHERE user_id != ?")
    .all(userId) as SwipeInteraction[];

  // Group by user_id
  const userSwipeMap = new Map<string, { liked: Set<string>; passed: Set<string> }>();
  
  for (const swipe of allSwipes) {
    if (!userSwipeMap.has(swipe.user_id)) {
      userSwipeMap.set(swipe.user_id, { liked: new Set(), passed: new Set() });
    }
    const userData = userSwipeMap.get(swipe.user_id)!;
    if (swipe.action === 'like') {
      userData.liked.add(swipe.candidate_id);
    } else if (swipe.action === 'pass') {
      userData.passed.add(swipe.candidate_id);
    }
  }

  // Calculate Jaccard similarity for each user
  const similarities: Array<{ userId: string; similarity: number }> = [];

  for (const [otherUserId, otherSwipes] of userSwipeMap.entries()) {
    // Calculate intersection and union
    const likedIntersection = [...userLikedIds].filter(id => otherSwipes.liked.has(id)).length;
    const passedIntersection = [...userPassedIds].filter(id => otherSwipes.passed.has(id)).length;
    
    const likedUnion = new Set([...userLikedIds, ...otherSwipes.liked]).size;
    const passedUnion = new Set([...userPassedIds, ...otherSwipes.passed]).size;

    // Weight likes more than passes (agreement on likes is more important)
    const likedSimilarity = likedUnion > 0 ? likedIntersection / likedUnion : 0;
    const passedSimilarity = passedUnion > 0 ? passedIntersection / passedUnion : 0;
    
    // Combined similarity (weighted: 70% likes, 30% passes)
    const similarity = likedSimilarity * 0.7 + passedSimilarity * 0.3;

    if (similarity > 0) {
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
 * Returns candidate IDs that similar users liked
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

  // Get profiles that similar users liked (weighted by similarity)
  const recommendations = new Map<string, number>(); // candidate_id -> weighted score

  for (const { userId: similarUserId, similarity } of similarUsers) {
    const likedProfiles = db
      .prepare("SELECT candidate_id FROM swipe_interactions WHERE user_id = ? AND action = 'like'")
      .all(similarUserId) as Array<{ candidate_id: string }>;

    for (const { candidate_id } of likedProfiles) {
      // Skip if already excluded or if current user already swiped
      if (excludeIds.includes(candidate_id)) continue;
      
      const existingSwipe = db
        .prepare("SELECT id FROM swipe_interactions WHERE user_id = ? AND candidate_id = ?")
        .get(userId, candidate_id);
      
      if (existingSwipe) continue; // Already swiped

      // Add weighted score
      const currentScore = recommendations.get(candidate_id) || 0;
      recommendations.set(candidate_id, currentScore + similarity);
    }
  }

  // Sort by score and return top N
  return Array.from(recommendations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([candidateId]) => candidateId);
}

