import { db } from '../database.js';
import { usNational10Digits } from '../utils/phoneDigits.js';

export { usNational10Digits } from '../utils/phoneDigits.js';

/**
 * Former founder/internal phones that were auto-hidden at signup.
 * Used once on deploy to set hidden_from_browse = 0 for those accounts.
 */
const LEGACY_AUTO_HIDDEN_PHONES_10 = [
  '5413163939',
  '5419444820',
  '5414997132',
  '5412952192',
] as const;

/** New signups are visible in Connect/browse unless an admin hides them. */
export function hiddenFromBrowseFlagForNewUser(_phone: string | null | undefined): number {
  return 0;
}

/** User IDs that must never appear in browse / Connect / weekly candidate pools for others. */
export async function getHiddenFromBrowseUserIds(): Promise<string[]> {
  const raw = db.prepare(
    'SELECT id FROM users WHERE COALESCE(hidden_from_browse, 0) = 1',
  ).all();
  const rows = (raw instanceof Promise ? await raw : raw) as { id: string }[];
  return [...new Set(rows.map((r) => r.id))];
}

export async function setUserHiddenFromBrowse(
  userId: string,
  hidden: boolean,
): Promise<void> {
  await (db
    .prepare('UPDATE users SET hidden_from_browse = ? WHERE id = ?')
    .run([hidden ? 1 : 0, userId]) as Promise<unknown>);
}

/** No-op — default phone list removed; admin Hide/Show controls visibility. */
export async function applyDefaultHiddenFromBrowseForUser(
  _userId: string,
  _phone: string | null | undefined,
): Promise<void> {}

const LEGACY_UNHIDE_BOOT_FLAG = 'legacy_auto_hidden_phones_unhidden_v1';

async function legacyUnhideBootFlagApplied(): Promise<boolean> {
  const usePostgres = !!process.env.DATABASE_URL;
  await (db.exec(
    usePostgres
      ? `CREATE TABLE IF NOT EXISTS app_boot_flags (
           flag_key VARCHAR(255) PRIMARY KEY,
           applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         )`
      : `CREATE TABLE IF NOT EXISTS app_boot_flags (
           flag_key TEXT PRIMARY KEY,
           applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
         )`,
  ) as Promise<void>);

  const row = await (db
    .prepare('SELECT flag_key FROM app_boot_flags WHERE flag_key = ?')
    .get([LEGACY_UNHIDE_BOOT_FLAG]) as Promise<{ flag_key: string } | undefined>);
  return !!row;
}

async function markLegacyUnhideBootFlag(): Promise<void> {
  await (db
    .prepare('INSERT INTO app_boot_flags (flag_key) VALUES (?)')
    .run([LEGACY_UNHIDE_BOOT_FLAG]) as Promise<unknown>);
}

/**
 * One-time on deploy: make accounts that were auto-hidden via the old internal phone list visible.
 * Does not change users an admin hid manually (different phones). Admin Hide/Show still works after.
 */
export async function unhideLegacyAutoHiddenFromBrowsePhones(): Promise<number> {
  if (await legacyUnhideBootFlagApplied()) {
    return 0;
  }

  const legacy = new Set<string>(LEGACY_AUTO_HIDDEN_PHONES_10);

  const stmt = db.prepare(
    "SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number != ''",
  );
  const raw = stmt.all();
  const rows = (raw instanceof Promise ? await raw : raw) as {
    id: string;
    phone_number: string;
  }[];

  let updated = 0;
  for (const r of rows) {
    const n = usNational10Digits(r.phone_number);
    if (!n || !legacy.has(n)) continue;
    await setUserHiddenFromBrowse(r.id, false);
    updated += 1;
  }

  await markLegacyUnhideBootFlag();
  return updated;
}
