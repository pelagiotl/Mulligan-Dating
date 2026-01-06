import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Database path - use environment variable or default to backend directory
// In production (compiled), dist/ is the working directory, so go up one level
const dbPath = process.env.DATABASE_PATH || 
  (process.env.NODE_ENV === 'production' 
    ? path.join(process.cwd(), "..", "mulligan.db")
    : path.join(process.cwd(), "mulligan.db"));

// TokenRow interface for database operations
interface TokenRow {
  id: string;
  user_id: string;
  granted_at: string;
  used_at: string | null;
  returned_at: string | null;
  match_id: string | null;
  source?: string | null;
}

export const db = new Database(dbPath);

export function initDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_premium INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_restricted INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      location TEXT,
      bio TEXT,
      photo_url TEXT,
      looking_for TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Photos table - multiple photos per profile
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      url TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Interests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Preferences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      profile_id TEXT UNIQUE NOT NULL,
      min_age INTEGER DEFAULT 18,
      max_age INTEGER DEFAULT 99,
      preferred_genders TEXT,
      max_distance INTEGER DEFAULT 50,
      relationship_type TEXT,
      intent INTEGER DEFAULT 5,
      "values" TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);
  
  // Add new columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE preferences ADD COLUMN intent INTEGER DEFAULT 5`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE preferences ADD COLUMN "values" TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Dealbreakers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dealbreakers (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Partner qualities table
  db.exec(`
    CREATE TABLE IF NOT EXISTS partner_qualities (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      quality TEXT NOT NULL,
      importance INTEGER DEFAULT 5,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Lifestyle table - stores user's lifestyle attributes
  db.exec(`
    CREATE TABLE IF NOT EXISTS lifestyle (
      id TEXT PRIMARY KEY,
      profile_id TEXT UNIQUE NOT NULL,
      smoking TEXT,
      drinking TEXT,
      children TEXT,
      pets TEXT,
      religion TEXT,
      work_life_balance TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Mulligan Tokens table - users get 3 tokens per week (max 3 at a time)
  db.exec(`
    CREATE TABLE IF NOT EXISTS mulligan_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME,
      returned_at DATETIME,
      match_id TEXT,
      source TEXT DEFAULT 'weekly',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Add source column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE mulligan_tokens ADD COLUMN source TEXT DEFAULT 'weekly'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Referrals table - tracks referral relationships
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL,
      referral_code TEXT NOT NULL,
      token_granted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(referred_id)
    )
  `);

  // Matches table - two-stage reveal system
  // Stages: pending (one side sent), stage1 (mutual match, no photos), stage2 (photos revealed), expired
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      user1_token_id TEXT,
      user2_token_id TEXT,
      status TEXT DEFAULT 'pending',
      stage TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stage1_at DATETIME,
      stage2_at DATETIME,
      expires_at DATETIME,
      user1_wants_reveal INTEGER DEFAULT 0,
      user2_wants_reveal INTEGER DEFAULT 0,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add reveal request columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE matches ADD COLUMN user1_wants_reveal INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE matches ADD COLUMN user2_wants_reveal INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Update existing matches to use 7-day expiration instead of 14 days
  // Set expiration to 7 days from stage1_at (or created_at if stage1_at is null)
  try {
    db.exec(`
      UPDATE matches 
      SET expires_at = datetime(
        COALESCE(stage1_at, created_at), 
        '+7 days'
      )
      WHERE stage != 'expired' 
      AND expires_at IS NOT NULL
      AND datetime(COALESCE(stage1_at, created_at), '+7 days') < expires_at
    `);
    console.log('✅ Updated existing matches to 7-day expiration');
  } catch (e) {
    // Migration might fail if column doesn't exist yet, that's okay
    console.log('⚠️  Could not update match expiration dates:', e);
  }

  // One-time migration: Top up existing users to 3 tokens (if they have less than 3)
  try {
    const users = db.prepare('SELECT DISTINCT user_id FROM mulligan_tokens').all() as { user_id: string }[];
    
    for (const user of users) {
      const userTokens = db
        .prepare('SELECT * FROM mulligan_tokens WHERE user_id = ?')
        .all(user.user_id) as TokenRow[];
      
      const availableCount = userTokens.filter((t) => !t.used_at && !t.returned_at).length;
      
      if (availableCount < 3) {
        const tokensToGrant = 3 - availableCount;
        for (let i = 0; i < tokensToGrant; i++) {
          const tokenId = uuidv4();
          db.prepare(
            `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'migration')`
          ).run(tokenId, user.user_id);
        }
        console.log(`✅ Topped up user ${user.user_id} to 3 tokens (granted ${tokensToGrant})`);
      }
    }
    console.log('✅ Token migration complete');
  } catch (e) {
    console.log('⚠️  Could not run token migration:', e);
  }

  // Messages table for chat between matches
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Blocks table - users blocking other users
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  // Add last_active_at to users table if it doesn't exist
  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_active_at DATETIME`);
  } catch (e) {
    // Column already exists, ignore
  }

  // One-time migration: Top up existing users to 3 tokens (if they have less than 3)
  try {
    const { v4: uuidv4 } = require('uuid');
    const users = db.prepare('SELECT DISTINCT user_id FROM mulligan_tokens').all() as { user_id: string }[];
    
    let totalGranted = 0;
    for (const user of users) {
      const userTokens = db
        .prepare('SELECT * FROM mulligan_tokens WHERE user_id = ?')
        .all(user.user_id) as Array<{ used_at: string | null; returned_at: string | null }>;
      
      const availableCount = userTokens.filter((t) => !t.used_at && !t.returned_at).length;
      
      if (availableCount < 3) {
        const tokensToGrant = 3 - availableCount;
        for (let i = 0; i < tokensToGrant; i++) {
          const tokenId = uuidv4();
          db.prepare(
            `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'migration')`
          ).run(tokenId, user.user_id);
        }
        totalGranted += tokensToGrant;
      }
    }
    if (totalGranted > 0) {
      console.log(`✅ Token migration: Granted ${totalGranted} tokens to top up users to 3 tokens`);
    }
  } catch (e) {
    console.log('⚠️  Could not run token migration:', e);
  }

  console.log("✅ Database initialized");
}
