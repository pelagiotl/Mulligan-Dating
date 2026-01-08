import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";

/**
 * Track success signals for learning from user behavior
 * Success signals indicate real engagement and compatibility
 */

export type SuccessSignalType = 
  | "match_created"      // Both users connected (mutual match)
  | "message_exchanged"  // Messages sent (engagement)
  | "stage_advanced"     // Stage1 -> Stage2 (strong engagement)
  | "contact_shared";    // Future: phone/social shared (very strong signal)

/**
 * Record a success signal
 */
export function recordSuccessSignal(
  userId: string,
  matchedUserId: string,
  matchId: string,
  signalType: SuccessSignalType,
  value: number = 1
): void {
  try {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO success_signals (id, user_id, matched_user_id, match_id, signal_type, signal_value)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, userId, matchedUserId, matchId, signalType, value);
  } catch (error) {
    console.error("Error recording success signal:", error);
    // Don't throw - success tracking shouldn't break the app
  }
}

/**
 * Get success score for a user-candidate pair
 * Higher score = more successful interactions
 */
export function getSuccessScore(userId: string, candidateId: string): number {
  try {
    const signals = db
      .prepare(`
        SELECT signal_type, SUM(signal_value) as total_value
        FROM success_signals
        WHERE user_id = ? AND matched_user_id = ?
        GROUP BY signal_type
      `)
      .all(userId, candidateId) as Array<{ signal_type: string; total_value: number }>;

    let score = 0;
    for (const signal of signals) {
      switch (signal.signal_type) {
        case "match_created":
          score += signal.total_value * 10; // Match = 10 points
          break;
        case "message_exchanged":
          score += signal.total_value * 2; // Each message = 2 points
          break;
        case "stage_advanced":
          score += signal.total_value * 20; // Stage advance = 20 points
          break;
        case "contact_shared":
          score += signal.total_value * 50; // Contact shared = 50 points (very strong)
          break;
      }
    }

    return score;
  } catch (error) {
    console.error("Error getting success score:", error);
    return 0;
  }
}

/**
 * Get all users that this user has had successful interactions with
 */
export function getSuccessfulMatches(userId: string): string[] {
  try {
    const matches = db
      .prepare(`
        SELECT DISTINCT matched_user_id
        FROM success_signals
        WHERE user_id = ?
        AND signal_type IN ('match_created', 'stage_advanced')
      `)
      .all(userId) as Array<{ matched_user_id: string }>;

    return matches.map(m => m.matched_user_id);
  } catch (error) {
    console.error("Error getting successful matches:", error);
    return [];
  }
}

