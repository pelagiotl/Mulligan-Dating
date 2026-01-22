import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectionQualityScore {
  score: number; // 0-100
  matchToConversationRate: number; // Percentage of matches that lead to conversations
  conversationDepthAvg: number; // Average message length and engagement
  responseTimeConsistency: number; // How consistently user responds
  profileCompleteness: number; // How complete their profile is
  dateSuccessRate: number; // Percentage of conversations that lead to dates
  secondDateRate: number; // Percentage of first dates that lead to second dates
  monthlyImprovement: number; // Percentage change from last month
  lastCalculatedAt: string;
}

/**
 * Calculate profile completeness score (0-100)
 */
async function calculateProfileCompleteness(userId: string): Promise<number> {
  const profileResult = db
    .prepare('SELECT * FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise
    ? await profileResult
    : profileResult) as {
    display_name: string | null;
    age: number | null;
    gender: string | null;
    location: string | null;
    bio: string | null;
    photo_url: string | null;
    looking_for: string | null;
  } | undefined;

  if (!profile) {
    return 0;
  }

  let score = 0;
  const maxScore = 100;

  // Basic info (40 points)
  if (profile.display_name) score += 10;
  if (profile.age) score += 10;
  if (profile.gender) score += 10;
  if (profile.location) score += 10;

  // Bio (20 points)
  if (profile.bio) {
    const bioLength = profile.bio.length;
    if (bioLength > 200) score += 20;
    else if (bioLength > 100) score += 15;
    else if (bioLength > 50) score += 10;
    else if (bioLength > 0) score += 5;
  }

  // Photo (20 points)
  const photosResult = db
    .prepare('SELECT COUNT(*) as count FROM photos WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)')
    .get([userId]);
  const photos = (photosResult instanceof Promise
    ? await photosResult
    : photosResult) as { count: number } | undefined;
  if (photos && photos.count > 0) {
    score += Math.min(20, photos.count * 5); // 5 points per photo, max 20
  }

  // Interests (10 points)
  const interestsResult = db
    .prepare('SELECT COUNT(*) as count FROM interests WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)')
    .get([userId]);
  const interests = (interestsResult instanceof Promise
    ? await interestsResult
    : interestsResult) as { count: number } | undefined;
  if (interests && interests.count > 0) {
    score += Math.min(10, interests.count * 2); // 2 points per interest, max 10
  }

  // Looking for (10 points)
  if (profile.looking_for) score += 10;

  return Math.min(maxScore, score);
}

/**
 * Calculate match-to-conversation rate
 */
async function calculateMatchToConversationRate(userId: string): Promise<number> {
  // Calculate date 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateStr = ninetyDaysAgo.toISOString();

  // Get all matches for this user
  const matchesResult = db
    .prepare(
      `SELECT COUNT(*) as total FROM matches 
       WHERE (user1_id = ? OR user2_id = ?) 
       AND stage != 'expired' 
       AND created_at > ?`
    )
    .get([userId, userId, dateStr]);
  const matches = (matchesResult instanceof Promise
    ? await matchesResult
    : matchesResult) as { total: number } | undefined;

  if (!matches || matches.total === 0) {
    return 0;
  }

  // Get matches that have messages
  const conversationsResult = db
    .prepare(
      `SELECT COUNT(DISTINCT m.match_id) as count 
       FROM messages m
       JOIN matches ma ON m.match_id = ma.id
       WHERE (ma.user1_id = ? OR ma.user2_id = ?)
       AND ma.stage != 'expired'
       AND ma.created_at > ?`
    )
    .get([userId, userId, dateStr]);
  const conversations = (conversationsResult instanceof Promise
    ? await conversationsResult
    : conversationsResult) as { count: number } | undefined;

  const conversationCount = conversations?.count || 0;
  return (conversationCount / matches.total) * 100;
}

/**
 * Calculate conversation depth (average message length, engagement)
 */
async function calculateConversationDepth(userId: string): Promise<number> {
  // Calculate date 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateStr = ninetyDaysAgo.toISOString();

  const messagesResult = db
    .prepare(
      `SELECT AVG(LENGTH(content)) as avg_length, COUNT(*) as total
       FROM messages
       WHERE sender_id = ?
       AND sent_at > ?`
    )
    .get([userId, dateStr]);
  const messages = (messagesResult instanceof Promise
    ? await messagesResult
    : messagesResult) as { avg_length: number; total: number } | undefined;

  if (!messages || messages.total === 0) {
    return 0;
  }

  // Score based on average message length
  const avgLength = messages.avg_length || 0;
  let score = 0;

  if (avgLength > 100) score = 100;
  else if (avgLength > 75) score = 85;
  else if (avgLength > 50) score = 70;
  else if (avgLength > 25) score = 50;
  else if (avgLength > 10) score = 30;
  else score = 10;

  return score;
}

/**
 * Calculate response time consistency
 */
async function calculateResponseTimeConsistency(userId: string): Promise<number> {
  // Calculate date 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateStr = ninetyDaysAgo.toISOString();

  // Get messages where user responded (not the first message in a conversation)
  // Use database-agnostic approach: get all messages and calculate in JavaScript
  const messagesResult = db
    .prepare(
      `SELECT m1.match_id, m1.sent_at as prev_sent_at, m2.sent_at as response_sent_at
       FROM messages m1
       JOIN messages m2 ON m1.match_id = m2.match_id
       WHERE m1.sender_id != ?
       AND m2.sender_id = ?
       AND m2.sent_at > m1.sent_at
       AND m2.sent_at = (
         SELECT MIN(sent_at) 
         FROM messages 
         WHERE match_id = m1.match_id 
         AND sender_id = ?
         AND sent_at > m1.sent_at
       )
       AND m1.sent_at > ?
       ORDER BY m1.sent_at ASC
       LIMIT 50`
    )
    .all([userId, userId, userId, dateStr]);
  const messages = (messagesResult instanceof Promise
    ? await messagesResult
    : messagesResult) as Array<{ prev_sent_at: string; response_sent_at: string }>;

  if (messages.length === 0) {
    return 50; // Default neutral score
  }

  // Calculate response times in JavaScript (database-agnostic)
  const responseTimes = messages.map((m) => {
    const prevTime = new Date(m.prev_sent_at).getTime();
    const responseTime = new Date(m.response_sent_at).getTime();
    return (responseTime - prevTime) / (1000 * 60); // Convert to minutes
  });

  // Calculate average response time
  const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;

  // Score based on response time (faster = better, but not too fast)
  let score = 50;
  if (avgResponseTime < 30) score = 100; // Very responsive
  else if (avgResponseTime < 120) score = 90; // Ideal (1-2 hours)
  else if (avgResponseTime < 1440) score = 70; // Within 24 hours
  else if (avgResponseTime < 4320) score = 40; // 1-3 days
  else score = 20; // Very slow

  return score;
}

/**
 * Calculate overall connection quality score
 */
export async function calculateConnectionQualityScore(userId: string): Promise<ConnectionQualityScore> {
  const [
    profileCompleteness,
    matchToConversationRate,
    conversationDepth,
    responseTimeConsistency,
  ] = await Promise.all([
    calculateProfileCompleteness(userId),
    calculateMatchToConversationRate(userId),
    calculateConversationDepth(userId),
    calculateResponseTimeConsistency(userId),
  ]);

  // Date success rates (for now, set to 0 - can be updated when date tracking is added)
  const dateSuccessRate = 0;
  const secondDateRate = 0;

  // Weighted average
  const weights = {
    profileCompleteness: 0.20,
    matchToConversationRate: 0.25,
    conversationDepth: 0.25,
    responseTimeConsistency: 0.20,
    dateSuccessRate: 0.05,
    secondDateRate: 0.05,
  };

  const totalScore =
    profileCompleteness * weights.profileCompleteness +
    matchToConversationRate * weights.matchToConversationRate +
    conversationDepth * weights.conversationDepth +
    responseTimeConsistency * weights.responseTimeConsistency +
    dateSuccessRate * weights.dateSuccessRate +
    secondDateRate * weights.secondDateRate;

  // Calculate monthly improvement
  const existingScoreResult = db
    .prepare('SELECT score FROM connection_quality_scores WHERE user_id = ?')
    .get([userId]);
  const existingScore = (existingScoreResult instanceof Promise
    ? await existingScoreResult
    : existingScoreResult) as { score: number } | undefined;

  const previousScore = existingScore?.score || 50;
  const monthlyImprovement = previousScore > 0
    ? ((totalScore - previousScore) / previousScore) * 100
    : 0;

  return {
    score: Math.round(totalScore * 100) / 100,
    matchToConversationRate: Math.round(matchToConversationRate * 100) / 100,
    conversationDepthAvg: Math.round(conversationDepth * 100) / 100,
    responseTimeConsistency: Math.round(responseTimeConsistency * 100) / 100,
    profileCompleteness: Math.round(profileCompleteness * 100) / 100,
    dateSuccessRate,
    secondDateRate,
    monthlyImprovement: Math.round(monthlyImprovement * 100) / 100,
    lastCalculatedAt: new Date().toISOString(),
  };
}

/**
 * Save connection quality score
 */
export async function saveConnectionQualityScore(
  userId: string,
  scoreData: ConnectionQualityScore
): Promise<void> {
  // Check if score exists
  const existingResult = db
    .prepare('SELECT id FROM connection_quality_scores WHERE user_id = ?')
    .get([userId]);
  const existing = (existingResult instanceof Promise
    ? await existingResult
    : existingResult) as { id: string } | undefined;

  if (existing) {
    // Update existing
    await (db
      .prepare(
        `UPDATE connection_quality_scores 
         SET score = ?, match_to_conversation_rate = ?, conversation_depth_avg = ?,
             response_time_consistency = ?, profile_completeness = ?,
             date_success_rate = ?, second_date_rate = ?, monthly_improvement = ?,
             last_calculated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`
      )
      .run([
        scoreData.score,
        scoreData.matchToConversationRate,
        scoreData.conversationDepthAvg,
        scoreData.responseTimeConsistency,
        scoreData.profileCompleteness,
        scoreData.dateSuccessRate,
        scoreData.secondDateRate,
        scoreData.monthlyImprovement,
        userId,
      ]) as Promise<any>);
  } else {
    // Insert new
    const scoreId = uuidv4();
    await (db
      .prepare(
        `INSERT INTO connection_quality_scores 
         (id, user_id, score, match_to_conversation_rate, conversation_depth_avg,
          response_time_consistency, profile_completeness, date_success_rate,
          second_date_rate, monthly_improvement, last_calculated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run([
        scoreId,
        userId,
        scoreData.score,
        scoreData.matchToConversationRate,
        scoreData.conversationDepthAvg,
        scoreData.responseTimeConsistency,
        scoreData.profileCompleteness,
        scoreData.dateSuccessRate,
        scoreData.secondDateRate,
        scoreData.monthlyImprovement,
      ]) as Promise<any>);
  }

  // Save to history
  const historyId = uuidv4();
  await (db
    .prepare(
      `INSERT INTO connection_quality_history (id, user_id, score, recorded_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run([historyId, userId, scoreData.score]) as Promise<any>);
}

/**
 * Get connection quality score for a user
 */
export async function getConnectionQualityScore(
  userId: string
): Promise<ConnectionQualityScore | null> {
  const result = db
    .prepare(
      `SELECT score, match_to_conversation_rate, conversation_depth_avg,
              response_time_consistency, profile_completeness, date_success_rate,
              second_date_rate, monthly_improvement, last_calculated_at
       FROM connection_quality_scores
       WHERE user_id = ?`
    )
    .get([userId]);
  const score = (result instanceof Promise ? await result : result) as {
    score: number;
    match_to_conversation_rate: number;
    conversation_depth_avg: number;
    response_time_consistency: number;
    profile_completeness: number;
    date_success_rate: number;
    second_date_rate: number;
    monthly_improvement: number;
    last_calculated_at: string;
  } | undefined;

  if (!score) {
    return null;
  }

  return {
    score: score.score,
    matchToConversationRate: score.match_to_conversation_rate,
    conversationDepthAvg: score.conversation_depth_avg,
    responseTimeConsistency: score.response_time_consistency,
    profileCompleteness: score.profile_completeness,
    dateSuccessRate: score.date_success_rate,
    secondDateRate: score.second_date_rate,
    monthlyImprovement: score.monthly_improvement,
    lastCalculatedAt: score.last_calculated_at,
  };
}

/**
 * Get score history for trends
 */
export async function getConnectionQualityHistory(
  userId: string,
  days: number = 90
): Promise<Array<{ score: number; recordedAt: string }>> {
  // Calculate date N days ago
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);
  const dateStr = daysAgo.toISOString();

  const result = db
    .prepare(
      `SELECT score, recorded_at
       FROM connection_quality_history
       WHERE user_id = ?
       AND recorded_at > ?
       ORDER BY recorded_at ASC`
    )
    .all([userId, dateStr]);
  const history = (result instanceof Promise ? await result : result) as Array<{
    score: number;
    recorded_at: string;
  }>;

  return history.map((h) => ({
    score: h.score,
    recordedAt: h.recorded_at,
  }));
}

/**
 * Update and recalculate connection quality score
 */
export async function updateConnectionQualityScore(userId: string): Promise<ConnectionQualityScore> {
  const scoreData = await calculateConnectionQualityScore(userId);
  await saveConnectionQualityScore(userId, scoreData);
  return scoreData;
}

