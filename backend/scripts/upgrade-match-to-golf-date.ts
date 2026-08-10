/**
 * Upgrade an existing match to Golf Date + seed hole-prompt session.
 * Usage: npx tsx scripts/upgrade-match-to-golf-date.ts <phoneA> <phoneB>
 */

import 'dotenv/config';
import { initDatabase, db } from '../src/database.js';
import { findUserByPhone } from '../src/services/forceMatchByPhone.js';
import { MATCH_POOL_GOLF_DATE } from '../src/utils/matchPools.js';

const phoneA = process.argv[2];
const phoneB = process.argv[3];

if (!phoneA || !phoneB) {
  console.error('Usage: npx tsx scripts/upgrade-match-to-golf-date.ts <phoneA> <phoneB>');
  process.exit(1);
}

async function main() {
  await initDatabase();

  const u1 = await findUserByPhone(phoneA);
  const u2 = await findUserByPhone(phoneB);
  if (!u1 || !u2) {
    console.error('❌ User missing', {
      a: phoneA,
      b: phoneB,
      foundA: !!u1,
      foundB: !!u2,
    });
    process.exit(1);
  }

  const match = (await db
    .prepare(
      `SELECT id, connected_via, stage, status FROM matches
       WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
       AND stage != 'expired'
       ORDER BY COALESCE(stage1_at, created_at) DESC`,
    )
    .get([u1.id, u2.id, u2.id, u1.id])) as
    | { id: string; connected_via: string | null; stage: string; status: string }
    | undefined;

  if (!match) {
    console.error('❌ No active match found between these users');
    process.exit(1);
  }

  console.log('Match before:', match);

  await db.prepare(`UPDATE matches SET connected_via = ? WHERE id = ?`).run([
    MATCH_POOL_GOLF_DATE,
    match.id,
  ]);

  for (const uid of [u1.id, u2.id]) {
    await db
      .prepare(
        `UPDATE profiles
         SET golf_dates_opt_in = 1,
             golf_dates_joined_at = COALESCE(golf_dates_joined_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
      )
      .run([uid]);
  }

  const session = (await db
    .prepare('SELECT match_id, current_hole FROM golf_hole_prompt_sessions WHERE match_id = ?')
    .get([match.id])) as { match_id: string; current_hole: number } | undefined;

  if (!session) {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_sessions (match_id, current_hole, started_at, updated_at)
         VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run([match.id]);
    console.log('✅ Created hole-prompt session at hole 1');
  } else {
    console.log('ℹ️  Hole-prompt session already exists:', session);
  }

  const after = (await db
    .prepare('SELECT id, connected_via, stage, status FROM matches WHERE id = ?')
    .get([match.id])) as { id: string; connected_via: string; stage: string; status: string };

  console.log('✅ Match after:', after);
  console.log(`   ${u1.phone_number} ↔ ${u2.phone_number}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
