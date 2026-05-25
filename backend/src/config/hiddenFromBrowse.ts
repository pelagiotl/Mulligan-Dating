import { db } from '../database.js';
import { usNational10Digits } from '../utils/phoneDigits.js';

/**
 * US national 10-digit phones never shown as Connect/browse candidates unless admin sets "visible".
 * Formats like +15413163939, (541) 316-3939, etc. normalize via usNational10Digits().
 */
export const DEFAULT_HIDDEN_FROM_BROWSE_PHONES_10 = [
  '5413163939',
  '5419444820',
  '5414997132',
  '5412952192',
] as const;

/** @deprecated Use DEFAULT_HIDDEN_FROM_BROWSE_PHONES_10 */
export const HIDDEN_FROM_BROWSE_US_NATIONAL_10 = DEFAULT_HIDDEN_FROM_BROWSE_PHONES_10[0];

const DEFAULT_HIDDEN_PHONES_E164 = DEFAULT_HIDDEN_FROM_BROWSE_PHONES_10.map(
  (n) => `+1${n}`,
);

export { usNational10Digits } from '../utils/phoneDigits.js';

function collectHiddenNational10(): Set<string> {
  const set = new Set<string>();
  for (const n of DEFAULT_HIDDEN_FROM_BROWSE_PHONES_10) {
    set.add(n);
  }
  for (const p of DEFAULT_HIDDEN_PHONES_E164) {
    const n = usNational10Digits(p);
    if (n) set.add(n);
  }
  const fromEnv = (process.env.HIDDEN_FROM_BROWSE_PHONES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of fromEnv) {
    const n = usNational10Digits(p);
    if (n) set.add(n);
  }
  return set;
}

export function isDefaultHiddenFromBrowsePhone(phone: string | null | undefined): boolean {
  const n = usNational10Digits(phone);
  if (!n) return false;
  return collectHiddenNational10().has(n);
}

/** 1 when a new account should start hidden from the match pool (founder / internal lines). */
export function hiddenFromBrowseFlagForNewUser(phone: string | null | undefined): number {
  return isDefaultHiddenFromBrowsePhone(phone) ? 1 : 0;
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

/** Apply default hidden flag after signup when phone is on the internal list. */
export async function applyDefaultHiddenFromBrowseForUser(
  userId: string,
  phone: string | null | undefined,
): Promise<void> {
  if (isDefaultHiddenFromBrowsePhone(phone)) {
    await setUserHiddenFromBrowse(userId, true);
  }
}

/**
 * Ensure configured internal phones are marked hidden (idempotent).
 * Admin can later set hidden_from_browse = 0 per user to make them visible.
 */
export async function backfillHiddenFromBrowseFromDefaultPhones(): Promise<number> {
  const hidden10 = collectHiddenNational10();
  if (hidden10.size === 0) return 0;

  const stmt = db.prepare(
    'SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number != \'\'',
  );
  const raw = stmt.all();
  const rows = (raw instanceof Promise ? await raw : raw) as {
    id: string;
    phone_number: string;
  }[];

  let updated = 0;
  for (const r of rows) {
    const n = usNational10Digits(r.phone_number);
    if (!n || !hidden10.has(n)) continue;
    await setUserHiddenFromBrowse(r.id, true);
    updated += 1;
  }
  return updated;
}
