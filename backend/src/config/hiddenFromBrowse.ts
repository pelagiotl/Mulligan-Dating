import { db } from '../database.js';

/**
 * US national 10-digit form of (541) 316-3939 — never shown as a dating candidate to anyone.
 * Matching uses normalized digits so DB formats (+15413163939, 541-316-3939, etc.) all resolve.
 */
export const HIDDEN_FROM_BROWSE_US_NATIONAL_10 = '5413163939';

/**
 * Optional env: HIDDEN_FROM_BROWSE_PHONES — comma-separated E.164 or digit strings, merged with defaults.
 */
const DEFAULT_HIDDEN_PHONES_E164 = ['+15413163939'];

function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/** US national 10 digits (strips leading country code 1 when present). */
export function usNational10Digits(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone);
  if (d.length >= 11 && d.startsWith('1')) return d.slice(-10);
  if (d.length >= 10) return d.slice(-10);
  return null;
}

function collectHiddenNational10(): Set<string> {
  const set = new Set<string>();
  set.add(HIDDEN_FROM_BROWSE_US_NATIONAL_10);

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

/** User IDs that must never appear in browse / Connect / weekly candidate pools for others. */
export async function getHiddenFromBrowseUserIds(): Promise<string[]> {
  const hidden10 = collectHiddenNational10();
  if (hidden10.size === 0) return [];

  const stmt = db.prepare('SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number != \'\'');
  const raw = stmt.all();
  const rows = (raw instanceof Promise ? await raw : raw) as { id: string; phone_number: string }[];

  const ids: string[] = [];
  for (const r of rows) {
    const n = usNational10Digits(r.phone_number);
    if (n && hidden10.has(n)) ids.push(r.id);
  }
  return [...new Set(ids)];
}
