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

export async function deleteUserAccountData(userId: string): Promise<void> {
  const matches = await all<{ id: string }>(
    'SELECT id FROM matches WHERE user1_id = ? OR user2_id = ?',
    [userId, userId]
  );

  for (const match of matches) {
    await run('DELETE FROM messages WHERE match_id = ?', [match.id]);
  }

  await run('DELETE FROM matches WHERE user1_id = ? OR user2_id = ?', [userId, userId]);
  await run('DELETE FROM messages WHERE sender_id = ?', [userId]);

  await run('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?', [userId, userId]);
  await run('DELETE FROM blocked_phone_numbers WHERE blocker_id = ?', [userId]);
  await run('DELETE FROM reports WHERE reporter_id = ? OR reported_user_id = ?', [userId, userId]);
  await run('DELETE FROM mulligan_tokens WHERE user_id = ?', [userId]);
  await run('DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?', [userId, userId]);
  await run('DELETE FROM success_signals WHERE user_id = ? OR matched_user_id = ?', [userId, userId]);
  await run('DELETE FROM web_push_subscriptions WHERE user_id = ?', [userId]);
  await run('DELETE FROM web_checkout_sessions WHERE user_id = ?', [userId]);
  await run('DELETE FROM connection_quality_scores WHERE user_id = ?', [userId]);
  await run('DELETE FROM connection_quality_history WHERE user_id = ?', [userId]);
  await run('DELETE FROM match_reflections WHERE user_id = ?', [userId]);

  const profile = await (db
    .prepare('SELECT id FROM profiles WHERE user_id = ?')
    .get([userId]) as Promise<{ id: string } | undefined>);

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

  await run('DELETE FROM users WHERE id = ?', [userId]);
}
