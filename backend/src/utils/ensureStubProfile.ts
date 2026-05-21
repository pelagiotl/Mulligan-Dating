import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === '23505';
}

/**
 * Ensures a minimal profiles + preferences row exists after phone signup so the app can open main tabs
 * without completing the legacy onboarding wizard. Connect/browse matching stay gated until name, location, and photos pass connect rules.
 */
export async function ensureStubProfile(userId: string): Promise<void> {
  const existingResult = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([userId]);
  const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as { id: string } | undefined;
  if (existing) return;

  const profileId = uuidv4();
  const prefId = uuidv4();
  try {
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, user_id, display_name, age, gender, location, bio, photo_url, looking_for)
      VALUES (?, ?, '', 18, 'Other', NULL, NULL, NULL, NULL)
    `);
    await (insertProfile.run([profileId, userId]) as Promise<unknown>);
    const insertPref = db.prepare(`INSERT INTO preferences (id, profile_id) VALUES (?, ?)`);
    await (insertPref.run([prefId, profileId]) as Promise<unknown>);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}
