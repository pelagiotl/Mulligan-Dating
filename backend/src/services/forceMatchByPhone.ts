import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

export function normalizePhoneDisplay(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return '';
  return d.length === 10 ? `+1${d}` : `+${d}`;
}

function samePhoneDigits(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.slice(-10) === b.slice(-10);
}

export async function findUserByPhone(
  raw: string
): Promise<{ id: string; phone_number: string } | null> {
  const target = digitsOnly(raw);
  if (!target) return null;

  const rowsResult = db.prepare('SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL').all();
  const rows = (rowsResult instanceof Promise ? await rowsResult : rowsResult) as Array<{
    id: string;
    phone_number: string | null;
  }>;

  const found = rows.find((row) => samePhoneDigits(digitsOnly(row.phone_number), target));
  return found?.phone_number ? { id: found.id, phone_number: found.phone_number } : null;
}

export type ForceMatchResult =
  | {
      ok: true;
      created: true;
      matchId: string;
      user1: { id: string; phone_number: string };
      user2: { id: string; phone_number: string };
      expiresAt: string;
    }
  | {
      ok: true;
      created: false;
      matchId: string;
      stage: string;
      user1: { id: string; phone_number: string };
      user2: { id: string; phone_number: string };
    }
  | { ok: false; error: string; status: number };

export async function forceMatchByPhone(phoneA: string, phoneB: string): Promise<ForceMatchResult> {
  const u1 = await findUserByPhone(phoneA);
  const u2 = await findUserByPhone(phoneB);

  if (!u1) {
    return {
      ok: false,
      status: 404,
      error: `No user found for ${normalizePhoneDisplay(phoneA)}`,
    };
  }
  if (!u2) {
    return {
      ok: false,
      status: 404,
      error: `No user found for ${normalizePhoneDisplay(phoneB)}`,
    };
  }
  if (u1.id === u2.id) {
    return { ok: false, status: 400, error: 'Both phones resolve to the same user' };
  }

  const existingMatchResult = db
    .prepare(
      `SELECT id, stage FROM matches 
       WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
       AND stage != 'expired'`
    )
    .get([u1.id, u2.id, u2.id, u1.id]);
  const existingMatch = (existingMatchResult instanceof Promise
    ? await existingMatchResult
    : existingMatchResult) as { id: string; stage: string } | undefined;

  if (existingMatch) {
    return {
      ok: true,
      created: false,
      matchId: existingMatch.id,
      stage: existingMatch.stage,
      user1: u1,
      user2: u2,
    };
  }

  const matchId = uuidv4();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const insertResult = db
    .prepare(
      `INSERT INTO matches (id, user1_id, user2_id, user1_token_id, status, stage, stage1_at, expires_at)
       VALUES (?, ?, ?, NULL, 'mutual', 'stage1', CURRENT_TIMESTAMP, ?)`
    )
    .run([matchId, u1.id, u2.id, sevenDaysFromNow.toISOString()]);

  if (insertResult instanceof Promise) {
    await insertResult;
  }

  return {
    ok: true,
    created: true,
    matchId,
    user1: u1,
    user2: u2,
    expiresAt: sevenDaysFromNow.toISOString(),
  };
}
