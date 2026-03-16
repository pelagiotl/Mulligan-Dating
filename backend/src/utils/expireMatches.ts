/**
 * Mark matches as expired when their 7-day timer has passed.
 * Call this before any logic that treats "active" matches (e.g. browse, diagnose, match list)
 * so expired matches are excluded even if the user hasn't opened the Matches tab recently.
 */
import { db } from "../database.js";

export async function expireOldMatches(): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    const result = await db
      .prepare(
        `UPDATE matches SET stage = 'expired' 
         WHERE stage != 'expired' AND expires_at IS NOT NULL AND expires_at < ?`
      )
      .run([nowIso]);
    const changes = (result as { changes?: number }).changes ?? 0;
    if (changes > 0 && process.env.NODE_ENV !== "test") {
      console.log(`⏰ Auto-expired ${changes} match(es) past 7-day limit`);
    }
  } catch (err) {
    console.warn("Failed to auto-expire matches (non-fatal):", err);
  }
}
