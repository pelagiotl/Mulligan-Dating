import { db } from '../database.js';

/**
 * Phone numbers that must never appear as dating candidates (founder / internal accounts).
 * Stored in DB as E.164 from Twilio/SNS format (e.g. +15413163939 for (541) 316-3939).
 *
 * Optional env: HIDDEN_FROM_BROWSE_PHONES — comma-separated E.164 values merged with defaults.
 */
const DEFAULT_HIDDEN_PHONES = ['+15413163939'];

function collectHiddenPhones(): string[] {
  const fromEnv = (process.env.HIDDEN_FROM_BROWSE_PHONES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_HIDDEN_PHONES, ...fromEnv])];
}

/** User IDs for the above phone numbers (empty if those users do not exist yet). */
export async function getHiddenFromBrowseUserIds(): Promise<string[]> {
  const phones = collectHiddenPhones();
  if (phones.length === 0) return [];

  const placeholders = phones.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT id FROM users WHERE phone_number IN (${placeholders})`);
  const raw = stmt.all(...phones);
  const rows = (raw instanceof Promise ? await raw : raw) as { id: string }[];
  return rows.map((r) => r.id);
}
