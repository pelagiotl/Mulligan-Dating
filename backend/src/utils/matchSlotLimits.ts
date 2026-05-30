import { db } from "../database.js";
import { DEFAULT_MATCH_SLOT_LIMIT } from "../config/matchSlots.js";

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
