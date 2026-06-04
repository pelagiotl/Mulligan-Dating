import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === '23505';
}

export type EnsureStubProfileOptions = {
  displayName?: string;
  location?: string | null;
};

/**
 * Ensures a minimal profiles + preferences row exists (e.g. first wizard save or settings update).
 * Connect/browse stay gated until profile requirements and account activation are met.
 */
export async function ensureStubProfile(
  userId: string,
  opts?: EnsureStubProfileOptions
): Promise<string> {
  const existingResult = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([userId]);
  const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as { id: string } | undefined;
  if (existing) return existing.id;

  const displayName = opts?.displayName?.trim() ?? '';
  const location = opts?.location?.trim() ? opts.location.trim() : null;

  const profileId = uuidv4();
  const prefId = uuidv4();
  try {
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, user_id, display_name, age, gender, location, bio, photo_url, looking_for)
      VALUES (?, ?, ?, NULL, '', ?, NULL, NULL, NULL)
    `);
    await (insertProfile.run([profileId, userId, displayName, location]) as Promise<unknown>);
    const insertPref = db.prepare(`INSERT INTO preferences (id, profile_id) VALUES (?, ?)`);
    await (insertPref.run([prefId, profileId]) as Promise<unknown>);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      const raced = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([userId]);
      const row = (raced instanceof Promise ? await raced : raced) as { id: string } | undefined;
      if (row) return row.id;
    }
    throw err;
  }
  return profileId;
}
