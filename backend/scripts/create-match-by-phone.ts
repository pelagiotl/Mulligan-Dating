/**
 * Admin script: create a mutual stage1 match between two users by phone number.
 * Bypasses tokens, preferences, and distance (same row shape as POST /matches/connect).
 *
 * Uses the same DB as the API: set DATABASE_URL (Postgres / Render) for production data.
 * Without DATABASE_URL, local SQLite at backend/mulligan.db is used — it must contain those users.
 *
 * Usage: npx tsx scripts/create-match-by-phone.ts <phoneA> <phoneB>
 * Example: npx tsx scripts/create-match-by-phone.ts +15413163939 +14582996946
 */

import 'dotenv/config';
import { initDatabase } from '../src/database.js';
import { forceMatchByPhone } from '../src/services/forceMatchByPhone.js';

const phoneA = process.argv[2];
const phoneB = process.argv[3];

if (!phoneA || !phoneB) {
  console.error('❌ Two phone numbers are required');
  console.log('Usage: npx tsx scripts/create-match-by-phone.ts <phoneA> <phoneB>');
  console.log('Example: npx tsx scripts/create-match-by-phone.ts +15413163939 +14582996946');
  process.exit(1);
}

async function main() {
  try {
    await initDatabase();

    const dbLabel = process.env.DATABASE_URL
      ? 'PostgreSQL (DATABASE_URL)'
      : 'local SQLite (backend/mulligan.db)';
    console.log(`🔍 Database: ${dbLabel}`);

    const result = await forceMatchByPhone(phoneA, phoneB);

    if (!result.ok) {
      console.error(`❌ ${result.error}`);
      if (result.status === 404) {
        console.error(
          '💡 Production users need DATABASE_URL in backend/.env (Render → backend service → Environment).'
        );
      }
      process.exit(1);
    }

    console.log(`   user1: ${result.user1.phone_number} → ${result.user1.id}`);
    console.log(`   user2: ${result.user2.phone_number} → ${result.user2.id}`);

    if (result.created) {
      console.log(`✅ Created match ${result.matchId}`);
      console.log(`   expires_at: ${result.expiresAt}`);
    } else {
      console.log(`ℹ️  Non-expired match already exists: ${result.matchId} (stage ${result.stage})`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating match:', error);
    process.exit(1);
  }
}

main();
