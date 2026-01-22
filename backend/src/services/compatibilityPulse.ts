import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

// Check if we're using PostgreSQL
const usePostgres = !!process.env.DATABASE_URL;

export interface CompatibilityScore {
  score: number; // 0-100
  responseTimeAvg: number; // in minutes
  messageLengthAvg: number; // in characters
  engagementLevel: 'cold' | 'neutral' | 'warming' | 'hot';
  lastCalculatedAt: string;
}

/**
 * Calculate compatibility score based on message engagement metrics
 */
export async function calculateCompatibilityScore(
  matchId: string,
  user1Id: string,
  user2Id: string
): Promise<CompatibilityScore> {
  // Get all messages for this match
  const messagesResult = db
    .prepare(
      `SELECT sender_id, content, sent_at, read_at 
       FROM messages 
       WHERE match_id = ? 
       ORDER BY sent_at ASC`
    )
    .all([matchId]);
  const messages = (messagesResult instanceof Promise
    ? await messagesResult
    : messagesResult) as Array<{
    sender_id: string;
    content: string;
    sent_at: string;
    read_at: string | null;
  }>;

  if (messages.length === 0) {
    // No messages yet - return neutral score
    return {
      score: 50,
      responseTimeAvg: 0,
      messageLengthAvg: 0,
      engagementLevel: 'neutral',
      lastCalculatedAt: new Date().toISOString(),
    };
  }

  // Calculate response times (time between messages from different users)
  const responseTimes: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    const prevMessage = messages[i - 1];
    const currentMessage = messages[i];
    
    // Only calculate if different users (actual response)
    if (prevMessage.sender_id !== currentMessage.sender_id) {
      const prevTime = new Date(prevMessage.sent_at).getTime();
      const currentTime = new Date(currentMessage.sent_at).getTime();
      const diffMinutes = (currentTime - prevTime) / (1000 * 60);
      responseTimes.push(diffMinutes);
    }
  }

  // Calculate average response time (in minutes)
  const responseTimeAvg = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;

  // Calculate average message length
  const messageLengths = messages.map(m => m.content.length);
  const messageLengthAvg = messageLengths.reduce((sum, len) => sum + len, 0) / messageLengths.length;

  // Calculate engagement level based on multiple factors
  let score = 50; // Start at neutral

  // Response time factor (faster = better, but not too fast)
  // Ideal: 30-120 minutes (1-2 hours)
  if (responseTimeAvg > 0) {
    if (responseTimeAvg < 30) {
      score += 10; // Very responsive
    } else if (responseTimeAvg < 120) {
      score += 15; // Ideal response time
    } else if (responseTimeAvg < 1440) {
      score += 5; // Within 24 hours
    } else if (responseTimeAvg < 4320) {
      score -= 5; // 1-3 days
    } else {
      score -= 15; // Very slow
    }
  }

  // Message length factor (longer messages = more engagement)
  if (messageLengthAvg > 100) {
    score += 15; // Substantial messages
  } else if (messageLengthAvg > 50) {
    score += 10; // Good length
  } else if (messageLengthAvg < 10) {
    score -= 10; // Very short (likely low effort)
  }

  // Message frequency factor (more messages = better engagement)
  const messageCount = messages.length;
  if (messageCount > 20) {
    score += 10; // Active conversation
  } else if (messageCount > 10) {
    score += 5;
  } else if (messageCount < 3) {
    score -= 10; // Barely started
  }

  // Read status factor (if messages are being read)
  const readMessages = messages.filter(m => m.read_at !== null).length;
  const readRatio = readMessages / messages.length;
  if (readRatio > 0.8) {
    score += 10; // High read rate
  } else if (readRatio < 0.5) {
    score -= 10; // Low read rate
  }

  // Clamp score between 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine engagement level
  let engagementLevel: 'cold' | 'neutral' | 'warming' | 'hot';
  if (score >= 75) {
    engagementLevel = 'hot';
  } else if (score >= 60) {
    engagementLevel = 'warming';
  } else if (score >= 40) {
    engagementLevel = 'neutral';
  } else {
    engagementLevel = 'cold';
  }

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    responseTimeAvg: Math.round(responseTimeAvg * 100) / 100,
    messageLengthAvg: Math.round(messageLengthAvg * 100) / 100,
    engagementLevel,
    lastCalculatedAt: new Date().toISOString(),
  };
}

/**
 * Save compatibility score to database
 */
export async function saveCompatibilityScore(
  matchId: string,
  user1Id: string,
  user2Id: string,
  scoreData: CompatibilityScore
): Promise<void> {
  const scoreId = uuidv4();
  
  // Check if score already exists
  const existingResult = db
    .prepare('SELECT id FROM compatibility_scores WHERE match_id = ?')
    .get([matchId]);
  const existing = (existingResult instanceof Promise
    ? await existingResult
    : existingResult) as { id: string } | undefined;

  // Try to save the score - handle both INTEGER and DECIMAL column types
  try {
    if (existing) {
      // Update existing score - try with CAST first (for DECIMAL column)
      try {
        const updateSql = usePostgres
          ? `UPDATE compatibility_scores 
             SET score = CAST(? AS DECIMAL(5,2)), response_time_avg = ?, message_length_avg = ?, 
                 engagement_level = ?, last_calculated_at = CURRENT_TIMESTAMP
             WHERE match_id = ?`
          : `UPDATE compatibility_scores 
             SET score = ?, response_time_avg = ?, message_length_avg = ?, 
                 engagement_level = ?, last_calculated_at = CURRENT_TIMESTAMP
             WHERE match_id = ?`;
        await (db
          .prepare(updateSql)
          .run([
            scoreData.score,
            scoreData.responseTimeAvg,
            scoreData.messageLengthAvg,
            scoreData.engagementLevel,
            matchId,
          ]) as Promise<any>);
      } catch (castError: any) {
        // If CAST fails, column might still be INTEGER - try without CAST and round the score
        if (castError?.message?.includes('integer') || castError?.message?.includes('invalid input')) {
          console.warn('⚠️ Score column is still INTEGER, rounding score to integer:', Math.round(scoreData.score));
          const updateSql = `UPDATE compatibility_scores 
             SET score = ?, response_time_avg = ?, message_length_avg = ?, 
                 engagement_level = ?, last_calculated_at = CURRENT_TIMESTAMP
             WHERE match_id = ?`;
          await (db
            .prepare(updateSql)
            .run([
              Math.round(scoreData.score), // Round to integer
              scoreData.responseTimeAvg,
              scoreData.messageLengthAvg,
              scoreData.engagementLevel,
              matchId,
            ]) as Promise<any>);
        } else {
          throw castError;
        }
      }
    } else {
      // Insert new score - try with CAST first (for DECIMAL column)
      try {
        const insertSql = usePostgres
          ? `INSERT INTO compatibility_scores 
             (id, match_id, user1_id, user2_id, score, response_time_avg, 
              message_length_avg, engagement_level, last_calculated_at)
             VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(5,2)), ?, ?, ?, CURRENT_TIMESTAMP)`
          : `INSERT INTO compatibility_scores 
             (id, match_id, user1_id, user2_id, score, response_time_avg, 
              message_length_avg, engagement_level, last_calculated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
        await (db
          .prepare(insertSql)
          .run([
            scoreId,
            matchId,
            user1Id,
            user2Id,
            scoreData.score,
            scoreData.responseTimeAvg,
            scoreData.messageLengthAvg,
            scoreData.engagementLevel,
          ]) as Promise<any>);
      } catch (castError: any) {
        // If CAST fails, column might still be INTEGER - try without CAST and round the score
        if (castError?.message?.includes('integer') || castError?.message?.includes('invalid input')) {
          console.warn('⚠️ Score column is still INTEGER, rounding score to integer:', Math.round(scoreData.score));
          const insertSql = `INSERT INTO compatibility_scores 
             (id, match_id, user1_id, user2_id, score, response_time_avg, 
              message_length_avg, engagement_level, last_calculated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
          await (db
            .prepare(insertSql)
            .run([
              scoreId,
              matchId,
              user1Id,
              user2Id,
              Math.round(scoreData.score), // Round to integer
              scoreData.responseTimeAvg,
              scoreData.messageLengthAvg,
              scoreData.engagementLevel,
            ]) as Promise<any>);
        } else {
          throw castError;
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Error saving compatibility score:', error);
    throw error;
  }

  // Save to history
  const historyId = uuidv4();
  const historySql = usePostgres
    ? `INSERT INTO compatibility_score_history (id, match_id, score, recorded_at)
       VALUES (?, ?, CAST(? AS DECIMAL(5,2)), CURRENT_TIMESTAMP)`
    : `INSERT INTO compatibility_score_history (id, match_id, score, recorded_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
  await (db
    .prepare(historySql)
    .run([historyId, matchId, scoreData.score]) as Promise<any>);
}

/**
 * Get current compatibility score for a match
 */
export async function getCompatibilityScore(
  matchId: string
): Promise<CompatibilityScore | null> {
  const result = db
    .prepare(
      `SELECT score, response_time_avg, message_length_avg, 
              engagement_level, last_calculated_at
       FROM compatibility_scores
       WHERE match_id = ?`
    )
    .get([matchId]);
  const score = (result instanceof Promise ? await result : result) as {
    score: number;
    response_time_avg: number;
    message_length_avg: number;
    engagement_level: string;
    last_calculated_at: string;
  } | undefined;

  if (!score) {
    return null;
  }

  return {
    score: score.score,
    responseTimeAvg: score.response_time_avg,
    messageLengthAvg: score.message_length_avg,
    engagementLevel: score.engagement_level as 'cold' | 'neutral' | 'warming' | 'hot',
    lastCalculatedAt: score.last_calculated_at,
  };
}

/**
 * Recalculate and update compatibility score
 */
export async function updateCompatibilityScore(
  matchId: string,
  user1Id: string,
  user2Id: string
): Promise<CompatibilityScore> {
  const scoreData = await calculateCompatibilityScore(matchId, user1Id, user2Id);
  await saveCompatibilityScore(matchId, user1Id, user2Id, scoreData);
  return scoreData;
}

