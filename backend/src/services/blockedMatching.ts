import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { formatPhoneNationalDisplay, usNational10Digits } from '../utils/phoneDigits.js';
import { findUserByPhone } from './forceMatchByPhone.js';

async function getUserNational10(userId: string): Promise<string | null> {
  const rowResult = db.prepare('SELECT phone_number FROM users WHERE id = ?').get([userId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as
    | { phone_number: string | null }
    | undefined;
  return usNational10Digits(row?.phone_number ?? null);
}

/** User IDs from `blocks` (both directions). */
export async function getUserIdsExcludedByBlocks(userId: string): Promise<string[]> {
  const rows = await (db
    .prepare(
      `SELECT blocked_id as user_id FROM blocks WHERE blocker_id = ?
       UNION
       SELECT blocker_id as user_id FROM blocks WHERE blocked_id = ?`
    )
    .all([userId, userId]) as Promise<{ user_id: string }[]>);
  return rows.map((r) => r.user_id);
}

/** User IDs tied to phone numbers this user blocked, or who blocked this user's phone. */
export async function getUserIdsExcludedByPhoneBlocks(userId: string): Promise<string[]> {
  const myNational10 = await getUserNational10(userId);
  const ids = new Set<string>();

  const phoneRows = await (db
    .prepare(`SELECT phone_national_10 FROM blocked_phone_numbers WHERE blocker_id = ?`)
    .all([userId]) as Promise<{ phone_national_10: string }[]>);

  const blockedNational10 = new Set(phoneRows.map((r) => r.phone_national_10));
  if (blockedNational10.size > 0) {
    const allUsersResult = db.prepare(
      "SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number != ''"
    ).all();
    const allUsers = (allUsersResult instanceof Promise ? await allUsersResult : allUsersResult) as Array<{
      id: string;
      phone_number: string;
    }>;
    for (const u of allUsers) {
      const n = usNational10Digits(u.phone_number);
      if (n && blockedNational10.has(n)) ids.add(u.id);
    }
  }

  if (myNational10) {
    const reverseRows = await (db
      .prepare(`SELECT blocker_id FROM blocked_phone_numbers WHERE phone_national_10 = ?`)
      .all([myNational10]) as Promise<{ blocker_id: string }[]>);
    for (const rev of reverseRows) {
      if (rev.blocker_id !== userId) ids.add(rev.blocker_id);
    }
  }

  return [...ids];
}

export async function getAllExcludedUserIdsForBrowse(userId: string): Promise<string[]> {
  const [fromBlocks, fromPhones] = await Promise.all([
    getUserIdsExcludedByBlocks(userId),
    getUserIdsExcludedByPhoneBlocks(userId),
  ]);
  return [...new Set([...fromBlocks, ...fromPhones])];
}

/** True if `otherUserId` must not appear for `userId` (browse, connect initiator). */
export async function isInteractionBlocked(userId: string, otherUserId: string): Promise<boolean> {
  if (userId === otherUserId) return false;
  const excluded = await getAllExcludedUserIdsForBrowse(userId);
  return excluded.includes(otherUserId);
}

/** True if either user has blocked the other (account or phone block list). Used before Connect. */
export async function isPairBlocked(userId: string, otherUserId: string): Promise<boolean> {
  if (userId === otherUserId) return false;
  const [aBlocksB, bBlocksA] = await Promise.all([
    isInteractionBlocked(userId, otherUserId),
    isInteractionBlocked(otherUserId, userId),
  ]);
  return aBlocksB || bBlocksA;
}

async function expireMatchesBetween(userId: string, otherUserId: string): Promise<void> {
  await (db
    .prepare(
      `UPDATE matches SET stage = 'expired'
       WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
       AND stage != 'expired'`
    )
    .run([userId, otherUserId, otherUserId, userId]) as Promise<unknown>);
}

export type BlockByPhoneResult =
  | {
      ok: true;
      phoneNational10: string;
      phoneDisplay: string;
      blockedUserId: string | null;
      phoneOnly: boolean;
      alreadyBlocked: boolean;
    }
  | { ok: false; error: string; status: number };

export async function blockUserByPhoneNumber(
  blockerId: string,
  rawPhone: string
): Promise<BlockByPhoneResult> {
  const phoneNational10 = usNational10Digits(rawPhone);
  if (!phoneNational10) {
    return {
      ok: false,
      status: 400,
      error: 'Enter a valid 10-digit US phone number (e.g. 541-555-1234).',
    };
  }

  const myNational10 = await getUserNational10(blockerId);
  if (myNational10 && myNational10 === phoneNational10) {
    return { ok: false, status: 400, error: 'You cannot block your own phone number.' };
  }

  const phoneDisplay = formatPhoneNationalDisplay(phoneNational10);
  const matchedUser = await findUserByPhone(rawPhone);

  if (matchedUser) {
    if (matchedUser.id === blockerId) {
      return { ok: false, status: 400, error: 'You cannot block yourself.' };
    }

    const existingBlock = await (db
      .prepare('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?')
      .get([blockerId, matchedUser.id]) as Promise<{ id: string } | undefined>);

    if (existingBlock) {
      return {
        ok: true,
        phoneNational10,
        phoneDisplay,
        blockedUserId: matchedUser.id,
        phoneOnly: false,
        alreadyBlocked: true,
      };
    }

    const blockId = uuidv4();
    await (db
      .prepare(`INSERT INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)`)
      .run([blockId, blockerId, matchedUser.id]) as Promise<unknown>);
    await expireMatchesBetween(blockerId, matchedUser.id);

    await (db
      .prepare(
        `DELETE FROM blocked_phone_numbers WHERE blocker_id = ? AND phone_national_10 = ?`
      )
      .run([blockerId, phoneNational10]) as Promise<unknown>);

    return {
      ok: true,
      phoneNational10,
      phoneDisplay,
      blockedUserId: matchedUser.id,
      phoneOnly: false,
      alreadyBlocked: false,
    };
  }

  const existingPhone = await (db
    .prepare(
      `SELECT id FROM blocked_phone_numbers WHERE blocker_id = ? AND phone_national_10 = ?`
    )
    .get([blockerId, phoneNational10]) as Promise<{ id: string } | undefined>);

  if (existingPhone) {
    return {
      ok: true,
      phoneNational10,
      phoneDisplay,
      blockedUserId: null,
      phoneOnly: true,
      alreadyBlocked: true,
    };
  }

  const rowId = uuidv4();
  await (db
    .prepare(
      `INSERT INTO blocked_phone_numbers (id, blocker_id, phone_national_10) VALUES (?, ?, ?)`
    )
    .run([rowId, blockerId, phoneNational10]) as Promise<unknown>);

  return {
    ok: true,
    phoneNational10,
    phoneDisplay,
    blockedUserId: null,
    phoneOnly: true,
    alreadyBlocked: false,
  };
}

export async function unblockPhoneNumber(
  blockerId: string,
  rawPhone: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const phoneNational10 = usNational10Digits(rawPhone);
  if (!phoneNational10) {
    return { ok: false, status: 400, error: 'Invalid phone number.' };
  }

  const matchedUser = await findUserByPhone(rawPhone);
  let removed = false;

  if (matchedUser) {
    const blockResult = await (db
      .prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?')
      .run([blockerId, matchedUser.id]) as Promise<{ changes: number }>);
    if (blockResult.changes > 0) removed = true;
  }

  const phoneResult = await (db
    .prepare(
      `DELETE FROM blocked_phone_numbers WHERE blocker_id = ? AND phone_national_10 = ?`
    )
    .run([blockerId, phoneNational10]) as Promise<{ changes: number }>);
  if (phoneResult.changes > 0) removed = true;

  if (!removed) {
    return { ok: false, status: 404, error: 'That number is not on your block list.' };
  }
  return { ok: true };
}

/** For settings list: phone-only rows (no active user block for same number). */
export async function listBlockedPhoneNumbers(blockerId: string): Promise<
  Array<{ id: string; phoneNational10: string; phoneDisplay: string; blockedAt: string }>
> {
  const rows = await (db
    .prepare(
      `SELECT id, phone_national_10, created_at FROM blocked_phone_numbers
       WHERE blocker_id = ? ORDER BY created_at DESC`
    )
    .all([blockerId]) as Promise<
    { id: string; phone_national_10: string; created_at: string }[]
  >);

  return rows.map((r) => ({
    id: r.id,
    phoneNational10: r.phone_national_10,
    phoneDisplay: formatPhoneNationalDisplay(r.phone_national_10),
    blockedAt: r.created_at,
  }));
}
