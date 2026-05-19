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

function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

function normalizePhone(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return '';
  return d.length === 10 ? `+1${d}` : `+${d}`;
}

function samePhoneDigits(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.slice(-10) === b.slice(-10);
}

async function findUserByPhone(raw: string): Promise<{ id: string; phone_number: string } | null> {
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

    const dbLabel = process.env.DATABASE_URL
      ? 'PostgreSQL (DATABASE_URL)'
      : 'local SQLite (backend/mulligan.db)';
    console.log(`🔍 Database: ${dbLabel}`);
    console.log(`🔍 Looking up: ${n1} and ${n2} (last-10-digit match)`);

    const u1 = await findUserByPhone(phoneA);
    const u2 = await findUserByPhone(phoneB);

    if (!u1) {
      console.error(`❌ No user found for ${n1}`);
      console.error(
        '💡 Your accounts live on production Postgres. Add DATABASE_URL to backend/.env (copy from Render → your backend service → Environment), then run this again.'
      );
      console.error('   One-liner: DATABASE_URL="postgresql://..." npm run create-match-by-phone -- +15414011862 +15413163939');
      process.exit(1);
    }
    if (!u2) {
      console.error(`❌ No user found for ${n2}`);
      console.error(
        '💡 Your accounts live on production Postgres. Add DATABASE_URL to backend/.env (copy from Render → your backend service → Environment), then run this again.'
      );
      process.exit(1);
    }

    console.log(`   Found: ${u1.phone_number} → ${u1.id}`);
    console.log(`   Found: ${u2.phone_number} → ${u2.id}`);

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
    console.log(`   user1_id (${u1.phone_number}): ${userId}`);
    console.log(`   user2_id (${u2.phone_number}): ${targetUserId}`);
    console.log(`   expires_at: ${sevenDaysFromNow.toISOString()}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating match:', error);
    process.exit(1);
  }
}

createMatchByPhone();
