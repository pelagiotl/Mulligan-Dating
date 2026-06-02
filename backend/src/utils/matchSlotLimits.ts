import { db } from "../database.js";
import {
  DEFAULT_INCOMING_MATCH_SLOT_LIMIT,
  DEFAULT_MATCH_SLOT_LIMIT,
} from "../config/matchSlots.js";

/** Launch active-connection cap (independent of stale per-user rows or low MATCH_SLOT_LIMIT). */
const PLATFORM_CONNECTION_LIMIT = 10;

export async function getActiveMatchCount(userId: string): Promise<number> {
  const countResult = db
    .prepare(
      `SELECT COUNT(*) as count FROM matches 
       WHERE (user1_id = ? OR user2_id = ?) AND stage != 'expired'`,
    )
    .get([userId, userId]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as {
    count: number | string;
  };
  return Math.floor(Number(countRow?.count ?? 0));
}

/**
 * Incoming active matches where this user was selected as the target.
 * (Currently represented by user2_id in match rows.)
 */
export async function getActiveIncomingMatchCount(userId: string): Promise<number> {
  const countResult = db
    .prepare(
      `SELECT COUNT(*) as count FROM matches 
       WHERE user2_id = ? AND stage != 'expired'`,
    )
    .get([userId]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as {
    count: number | string;
  };
  return Math.floor(Number(countRow?.count ?? 0));
}

/**
 * Weekly incoming received since the latest free-token allotment window anchor.
 * This is intentionally non-refundable for the week (unmatch/block does not decrement).
 */
export async function getWeeklyIncomingMatchCount(userId: string): Promise<{
  count: number;
  anchorGrantedAt: string | null;
}> {
  const anchorResult = db
    .prepare(
      `SELECT granted_at
       FROM mulligan_tokens
       WHERE user_id = ?
         AND (source IS NULL OR source IN ('weekly', 'initial'))
       ORDER BY granted_at DESC
       LIMIT 1`,
    )
    .get([userId]);
  const anchorRow = (anchorResult instanceof Promise ? await anchorResult : anchorResult) as
    | { granted_at?: string | null }
    | undefined;
  const anchorGrantedAt = anchorRow?.granted_at ?? null;

  const countResult = anchorGrantedAt
    ? db
        .prepare(
          `SELECT COUNT(*) as count FROM matches
           WHERE user2_id = ?
             AND datetime(created_at) >= datetime(?)`,
        )
        .get([userId, anchorGrantedAt])
    : db
        .prepare(
          `SELECT COUNT(*) as count FROM matches
           WHERE user2_id = ?
             AND datetime(created_at) >= datetime('now', '-7 day')`,
        )
        .get([userId]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as {
    count: number | string;
  };
  return {
    count: Math.floor(Number(countRow?.count ?? 0)),
    anchorGrantedAt,
  };
}

/** True when user has used their weekly incoming allowance (unmatch/block does not free slots). */
export async function isAtWeeklyIncomingMatchLimit(userId: string): Promise<boolean> {
  const { count } = await getWeeklyIncomingMatchCount(userId);
  return count >= DEFAULT_INCOMING_MATCH_SLOT_LIMIT;
}

export async function getUserSlotLimit(userId: string): Promise<number> {
  const limitResult = db
    .prepare(`SELECT COALESCE(match_slot_limit, ?) as slot_limit FROM users WHERE id = ?`)
    .get([DEFAULT_MATCH_SLOT_LIMIT, userId]);
  const limitRow = (limitResult instanceof Promise ? await limitResult : limitResult) as
    | { slot_limit: number | string }
    | undefined;
  const raw = Math.floor(Number(limitRow?.slot_limit ?? DEFAULT_MATCH_SLOT_LIMIT));
  const cap = Math.max(DEFAULT_MATCH_SLOT_LIMIT, PLATFORM_CONNECTION_LIMIT);
  return Math.min(Math.max(raw, PLATFORM_CONNECTION_LIMIT), cap);
}
