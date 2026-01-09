// Quick migration script to add phone_number and phone_verified columns
// Run this once: npx tsx src/migrate-phone-columns.ts

import { db } from './database.js';

console.log('🔄 Running phone number migration...');

try {
  // Add phone_number column (without UNIQUE first, SQLite limitation)
  db.exec(`ALTER TABLE users ADD COLUMN phone_number TEXT`);
  console.log('✅ Added phone_number column');
  
  // Try to add UNIQUE constraint via index (SQLite doesn't support ALTER TABLE ADD CONSTRAINT)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL`);
    console.log('✅ Added unique index on phone_number');
  } catch (idxError: any) {
    console.log('ℹ️  Unique index may already exist or could not be created');
  }
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('ℹ️  phone_number column already exists');
  } else {
    console.error('❌ Error adding phone_number:', e.message);
  }
}

try {
  // Add phone_verified column
  db.exec(`ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0`);
  console.log('✅ Added phone_verified column');
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('ℹ️  phone_verified column already exists');
  } else {
    console.error('❌ Error adding phone_verified:', e.message);
  }
}

console.log('✅ Migration complete!');
process.exit(0);

