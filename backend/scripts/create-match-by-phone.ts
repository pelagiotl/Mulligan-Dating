/**
 * Admin script: create a mutual stage1 match between two users by phone number.
 * Bypasses tokens, preferences, and distance (same row shape as POST /matches/connect).
 *
 * Uses the same DB as the API: set DATABASE_URL (Postgres / Render) for production data.
 * Without DATABASE_URL, local SQLite at backend/mulligan.db is used — it must contain those users.
 *
 * Usage: npx tsx scripts/create-match-by-phone.ts <phoneA> <phoneB>
 * Example: npx tsx scripts/create-match-by-phone.ts +15414011862 +15413163939
 */

import 'dotenv/config';
import { db, initDatabase } from '../src/database.js';
import { v4 as uuidv4 } from 'uuid';

function normalizePhone(raw: string): string {
  const t = raw.trim();
  return t.startsWith('+') ? t : `+${t.replace(/\D/g, '')}`;
}

const phoneA = process.argv[2];
const phoneB = process.argv[3];

if (!phoneA || !phoneB) {
  console.error('❌ Two phone numbers are required');
  console.log('Usage: npx tsx scripts/create-match-by-phone.ts <phoneA> <phoneB>');
  console.log('Example: npx tsx scripts/create-match-by-phone.ts +15414011862 +15413163939');
  process.exit(1);
}

async function createMatchByPhone() {
  try {
    await initDatabase();

    const n1 = normalizePhone(phoneA);
    const n2 = normalizePhone(phoneB);

    console.log(`🔍 Resolving users: ${n1}, ${n2}`);

    const u1Result = db.prepare('SELECT id FROM users WHERE phone_number = ?').get([n1]);
    const u1 = (u1Result instanceof Promise ? await u1Result : u1Result) as { id: string } | undefined;

    const u2Result = db.prepare('SELECT id FROM users WHERE phone_number = ?').get([n2]);
    const u2 = (u2Result instanceof Promise ? await u2Result : u2Result) as { id: string } | undefined;

    if (!u1) {
      console.error(`❌ No user with phone ${n1}`);
      if (!process.env.DATABASE_URL) {
        console.error(
          '💡 Local SQLite has no such user. For production accounts, set DATABASE_URL (e.g. in backend/.env) and run again.'
        );
      }
      process.exit(1);
    }
    if (!u2) {
      console.error(`❌ No user with phone ${n2}`);
      if (!process.env.DATABASE_URL) {
        console.error(
          '💡 Local SQLite has no such user. For production accounts, set DATABASE_URL (e.g. in backend/.env) and run again.'
        );
      }
      process.exit(1);
    }

    const userId = u1.id;
    const targetUserId = u2.id;

    if (userId === targetUserId) {
      console.error('❌ Both phones resolve to the same user');
      process.exit(1);
    }

    const existingMatchResult = db
      .prepare(
        `SELECT id, stage FROM matches 
         WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
         AND stage != 'expired'`
      )
      .get([userId, targetUserId, targetUserId, userId]);
    const existingMatch = (existingMatchResult instanceof Promise
      ? await existingMatchResult
      : existingMatchResult) as { id: string; stage: string } | undefined;

    if (existingMatch) {
      console.log(`ℹ️  Non-expired match already exists: ${existingMatch.id} (stage ${existingMatch.stage})`);
      process.exit(0);
    }

    const matchId = uuidv4();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const insertResult = db.prepare(
      `INSERT INTO matches (id, user1_id, user2_id, user1_token_id, status, stage, stage1_at, expires_at)
       VALUES (?, ?, ?, NULL, 'mutual', 'stage1', CURRENT_TIMESTAMP, ?)`
    ).run([matchId, userId, targetUserId, sevenDaysFromNow.toISOString()]);

    if (insertResult instanceof Promise) {
      await insertResult;
    }

    console.log(`✅ Created match ${matchId}`);
    console.log(`   user1_id (phone ${n1}): ${userId}`);
    console.log(`   user2_id (phone ${n2}): ${targetUserId}`);
    console.log(`   expires_at: ${sevenDaysFromNow.toISOString()}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating match:', error);
    process.exit(1);
  }
}

createMatchByPhone();
