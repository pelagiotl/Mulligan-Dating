/**
 * Permanently delete a user and all associated data (matches, messages, profile, etc.).
 * Used by self-serve account deletion and admin moderation.
 */
import { db } from '../database.js';

async function run(sql: string, params: unknown[] = []): Promise<void> {
  await (db.prepare(sql).run(params) as Promise<unknown>);
}

async function all<T>(sql: string, params: unknown[]): Promise<T[]> {
  const result = db.prepare(sql).all(params);
  return (result instanceof Promise ? await result : result) as T[];
}

/** @returns true if a users row existed and was removed; false if already deleted (idempotent). */
export async function deleteUserAccountData(userId: string): Promise<boolean> {
  const uid = String(userId).trim();
  if (!uid) return false;

  const existing = await (db
    .prepare('SELECT id FROM users WHERE id = ?')
    .get([uid]) as Promise<{ id: string } | undefined>);
  if (!existing) return false;

  const matches = await all<{ id: string }>(
    'SELECT id FROM matches WHERE user1_id = ? OR user2_id = ?',
    [uid, uid]
  );

  for (const match of matches) {
    await run('DELETE FROM messages WHERE match_id = ?', [match.id]);
  }

  await run('DELETE FROM matches WHERE user1_id = ? OR user2_id = ?', [uid, uid]);
  await run('DELETE FROM messages WHERE sender_id = ?', [uid]);

  await run('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?', [uid, uid]);
  await run('DELETE FROM blocked_phone_numbers WHERE blocker_id = ?', [uid]);
  await run('DELETE FROM reports WHERE reporter_id = ? OR reported_user_id = ?', [uid, uid]);
  await run('DELETE FROM mulligan_tokens WHERE user_id = ?', [uid]);
  await run('DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?', [uid, uid]);
  await run('DELETE FROM success_signals WHERE user_id = ? OR matched_user_id = ?', [uid, uid]);
  await run('DELETE FROM web_push_subscriptions WHERE user_id = ?', [uid]);
  await run('DELETE FROM web_checkout_sessions WHERE user_id = ?', [uid]);
  await run('DELETE FROM connection_quality_scores WHERE user_id = ?', [uid]);
  await run('DELETE FROM connection_quality_history WHERE user_id = ?', [uid]);
  await run('DELETE FROM match_reflections WHERE user_id = ?', [uid]);
  await run('DELETE FROM game_requests WHERE from_user_id = ? OR to_user_id = ?', [uid, uid]);
  await run('DELETE FROM game_unlocks WHERE unlocked_by_user_id = ?', [uid]);

  const profile = await (db
    .prepare('SELECT id FROM profiles WHERE user_id = ?')
    .get([uid]) as Promise<{ id: string } | undefined>);

  if (profile?.id) {
    const profileId = profile.id;
    await run('DELETE FROM interests WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM partner_qualities WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM dealbreakers WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM lifestyle WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM preferences WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM photos WHERE profile_id = ?', [profileId]);
    await run('DELETE FROM profiles WHERE id = ?', [profileId]);
  }

  await run('DELETE FROM users WHERE id = ?', [uid]);
  return true;
}
