import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { Pool } from "pg";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Check if we should use PostgreSQL
const usePostgres = !!process.env.DATABASE_URL;

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

let sqliteDb: DatabaseType | null = null;
let pgPool: Pool | null = null;

// Initialize database connection
console.log('🔍 Checking database configuration...');
console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('🔍 DATABASE_URL value:', process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET');
console.log('🔍 usePostgres:', usePostgres);

if (usePostgres) {
  console.log('🐘 Using PostgreSQL database');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }
  
  const postgresNeedsSsl =
    process.env.NODE_ENV === 'production' ||
    process.env.DATABASE_SSL === 'true' ||
    process.env.PGSSLMODE === 'require' ||
    /\.render\.com|sslmode=require/i.test(connectionString);

  pgPool = new Pool({
    connectionString,
    ssl: postgresNeedsSsl ? { rejectUnauthorized: false } : false,
    // Support 500–1000 concurrent users: pool allows more in-flight DB ops (default is 10). Keep below your DB plan's max_connections.
    max: process.env.NODE_ENV === 'production' ? 30 : 10,
  });
  
  // Test connection
  pgPool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('❌ PostgreSQL connection error:', err);
    } else {
      console.log('✅ PostgreSQL connected successfully');
    }
  });
} else {
  // Use SQLite for local development
  const dbPath = process.env.DATABASE_PATH || 
    (process.env.NODE_ENV === 'production' 
      ? path.join(process.cwd(), "..", "mulligan.db")
      : path.join(process.cwd(), "mulligan.db"));
  
  console.log('📁 Using SQLite database at:', dbPath);
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('foreign_keys = ON');
}

// Database wrapper to provide unified interface
class DatabaseWrapper {
  // Execute SQL (for CREATE TABLE, ALTER TABLE, etc.)
  async exec(sql: string): Promise<void> {
    if (usePostgres && pgPool) {
      // Convert SQLite syntax to PostgreSQL
      const pgSql = this.convertSQL(sql);
      await pgPool.query(pgSql);
    } else if (sqliteDb) {
      sqliteDb.exec(sql);
    }
  }

  // Prepare statement (returns a statement-like object)
  prepare(sql: string) {
    if (usePostgres && pgPool) {
      return this.createPostgresStatement(sql);
    } else if (sqliteDb) {
      return sqliteDb.prepare(sql);
    }
    throw new Error('Database not initialized');
  }

  // Convert SQLite SQL to PostgreSQL
  private convertSQL(sql: string): string {
    let pgSql = sql;
    
    // Convert INTEGER to INT (PostgreSQL prefers INT)
    pgSql = pgSql.replace(/INTEGER/g, 'INT');
    
    // Convert DATETIME to TIMESTAMP
    pgSql = pgSql.replace(/DATETIME/g, 'TIMESTAMP');
    
    // Keep TEXT as TEXT in PostgreSQL (unlimited length). Do NOT convert to VARCHAR(255)
    // or long content (prompts, messages, JSON) will fail with "value too long".
    
    // Handle IF NOT EXISTS - PostgreSQL supports it
    // Keep it as is
    
    return pgSql;
  }

  // Create a PostgreSQL statement that looks like SQLite
  private createPostgresStatement(sql: string) {
    // Convert ? placeholders to $1, $2, etc.
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // Helper to normalize params (SQLite .get/.run/.all accept multiple args: .all(a, b) or .all([a,b]))
    const normalizeParams = (...args: any[]): any[] => {
      if (args.length === 0) return [];
      if (args.length === 1) {
        const p = args[0];
        if (p === undefined || p === null) return [];
        if (Array.isArray(p)) return p;
        return [p];
      }
      return args;
    };
    
    return {
      get: async (...args: any[]) => {
        const normalizedParams = normalizeParams(...args);
        const result = await pgPool!.query(pgSql, normalizedParams);
        return result.rows[0] || null;
      },
      run: async (...args: any[]) => {
        const normalizedParams = normalizeParams(...args);
        const result = await pgPool!.query(pgSql, normalizedParams);
        const changes = typeof result.rowCount === 'number' ? result.rowCount : 0;
        return { lastInsertRowid: 0, changes };
      },
      all: async (...args: any[]) => {
        const normalizedParams = normalizeParams(...args);
        const result = await pgPool!.query(pgSql, normalizedParams);
        return result.rows;
      }
    };
  }
}

// Export db - either SQLite or PostgreSQL wrapper
export const db = usePostgres 
  ? (new DatabaseWrapper() as any)
  : (sqliteDb as DatabaseType);

export type { DatabaseType };

export async function initDatabase() {
  // Helper to execute SQL (handles both sync SQLite and async PostgreSQL)
  const execSQL = async (sql: string) => {
    if (usePostgres) {
      await (db as any).exec(sql);
    } else {
      (db as DatabaseType).exec(sql);
    }
  };

  // Users table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS users (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      email ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE,
      password ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      is_premium ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      referral_code ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE,
      tos_accepted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      privacy_accepted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Migration: Make email nullable (for phone-only authentication)
  try {
    await execSQL(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
  } catch (e: any) {
    // Column might already be nullable, or error for other reason - ignore
    if (!e.message?.includes('does not exist') && !e.message?.includes('column') && !e.message?.includes('constraint')) {
      console.warn('⚠️  Could not make email nullable (might already be nullable):', e.message);
    }
  }
  
  // Add columns if they don't exist (migration)
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN is_premium ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Add browse_unlocked_at column (tracks when user used a token to unlock browsing)
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN browse_unlocked_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN referral_code ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN is_admin ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN is_restricted ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN hidden_from_browse ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    // Add phone_number column (without UNIQUE first, SQLite limitation)
    await execSQL(`ALTER TABLE users ADD COLUMN phone_number ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
    // Add unique index for phone_number
    try {
      await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number) WHERE phone_number IS NOT NULL`);
    } catch (idxError) {
      // Index might already exist, ignore
    }
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN phone_verified ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN tos_accepted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN privacy_accepted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN account_status ${usePostgres ? 'VARCHAR(32)' : 'TEXT'} DEFAULT '${'active'}'`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN profile_activated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN last_client_platform ${usePostgres ? 'VARCHAR(16)' : 'TEXT'}`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN sms_opt_out ${usePostgres ? 'SMALLINT' : 'INTEGER'} DEFAULT 0`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `ALTER TABLE users ADD COLUMN onboarding_sms_nudge_sent_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`,
    );
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(
      `UPDATE users SET profile_activated_at = COALESCE(profile_activated_at, tos_accepted_at, created_at)
       WHERE COALESCE(account_status, 'active') = 'active' AND profile_activated_at IS NULL`,
    );
  } catch (e) {
    // ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN push_token ${usePostgres ? 'VARCHAR(500)' : 'TEXT'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN push_token_fail_count ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN match_slot_limit ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 10`);
  } catch (e) {
    // Column already exists, ignore
  }
  // Launch cap: 10 active matches per user (override via MATCH_SLOT_LIMIT env on server)
  try {
    await execSQL(
      `UPDATE users SET match_slot_limit = 10 WHERE match_slot_limit IS NULL OR match_slot_limit < 10 OR match_slot_limit > 10`,
    );
  } catch (e) {
    // Non-fatal; column might not exist on first run
  }

  // Profiles table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS profiles (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE NOT NULL,
      display_name ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      age ${usePostgres ? 'INT' : 'INTEGER'},
      gender ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      location ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      bio ${usePostgres ? 'TEXT' : 'TEXT'},
      photo_url ${usePostgres ? 'VARCHAR(500)' : 'TEXT'},
      looking_for ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Production Postgres may have been created with VARCHAR(255) on text fields; widen so
  // bios (up to 500) and Cloudinary URLs do not fail profile saves.
  if (usePostgres) {
    const profileColumnWidens: { sql: string; label: string }[] = [
      { sql: 'ALTER TABLE profiles ALTER COLUMN bio TYPE TEXT', label: 'profiles.bio' },
      { sql: 'ALTER TABLE profiles ALTER COLUMN photo_url TYPE VARCHAR(2000)', label: 'profiles.photo_url' },
      { sql: 'ALTER TABLE profiles ALTER COLUMN looking_for TYPE VARCHAR(500)', label: 'profiles.looking_for' },
      { sql: 'ALTER TABLE photos ALTER COLUMN url TYPE VARCHAR(2000)', label: 'photos.url' },
    ];
    for (const { sql, label } of profileColumnWidens) {
      try {
        await execSQL(sql);
        console.log(`✅ PostgreSQL widened ${label}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`⚠️  Could not widen ${label} (may already be correct):`, msg);
      }
    }
  }

  // Photos table - multiple photos per profile
  await execSQL(`
    CREATE TABLE IF NOT EXISTS photos (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      url ${usePostgres ? 'VARCHAR(500)' : 'TEXT'} NOT NULL,
      display_order ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      is_primary ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Interests table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS interests (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      name ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      category ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Preferences table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS preferences (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE NOT NULL,
      min_age ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 18,
      max_age ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 99,
      preferred_genders ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      max_distance ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 50,
      relationship_type ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      intent ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 5,
      "values" ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);
  
  // Add new columns if they don't exist (migration)
  try {
    await execSQL(`ALTER TABLE preferences ADD COLUMN intent ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 5`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE preferences ADD COLUMN "values" ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Dealbreakers table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS dealbreakers (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      description ${usePostgres ? 'VARCHAR(500)' : 'TEXT'} NOT NULL,
      category ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Partner qualities table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS partner_qualities (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      quality ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      importance ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 5,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Lifestyle table - stores user's lifestyle attributes
  await execSQL(`
    CREATE TABLE IF NOT EXISTS lifestyle (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      profile_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE NOT NULL,
      smoking ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      drinking ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      children ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      pets ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      religion ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      work_life_balance ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      works_out ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Add works_out column if it doesn't exist (migration)
  try {
    await execSQL(`ALTER TABLE lifestyle ADD COLUMN works_out ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await execSQL(`ALTER TABLE lifestyle ADD COLUMN political ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Mulligan Tokens table - users get 7 tokens initially and 7 more per week (max 7 at a time)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS mulligan_tokens (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      granted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      used_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      returned_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      source ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} DEFAULT 'weekly',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Add source column if it doesn't exist (migration)
  try {
    await execSQL(`ALTER TABLE mulligan_tokens ADD COLUMN source ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} DEFAULT 'weekly'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Referrals table - tracks referral relationships
  await execSQL(`
    CREATE TABLE IF NOT EXISTS referrals (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      referrer_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      referred_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      referral_code ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      token_granted ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(referred_id)
    )
  `);

  // Matches table - two-stage reveal system
  // Stages: pending (one side sent), stage1 (mutual — primary photo only), stage2 (each sent 3+ msgs — all photos), expired
  await execSQL(`
    CREATE TABLE IF NOT EXISTS matches (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user1_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      user2_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      user1_token_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      user2_token_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      status ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} DEFAULT 'pending',
      stage ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} DEFAULT 'pending',
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      stage1_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      stage2_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      expires_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      user1_wants_reveal ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      user2_wants_reveal ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add reveal request columns if they don't exist (migration)
  try {
    await execSQL(`ALTER TABLE matches ADD COLUMN user1_wants_reveal ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE matches ADD COLUMN user2_wants_reveal ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Update existing matches to use 7-day expiration instead of 14 days
  // Set expiration to 7 days from stage1_at (or created_at if stage1_at is null)
  // Note: This uses SQLite-specific datetime() function, skip for PostgreSQL
  if (!usePostgres) {
    try {
      await execSQL(`
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
  }

  // Messages table for chat between matches
  await execSQL(`
    CREATE TABLE IF NOT EXISTS messages (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      sender_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      content ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      sent_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      read_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add image_url to messages for chat photo sharing
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN image_url ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  // Add video_url and audio_url for chat video/voice
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN video_url ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) { /* ignore */ }
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN audio_url ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) { /* ignore */ }
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN liked_by_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* ignore */ }
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN laughed_by_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* ignore */ }
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN heart_eyes_by_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* ignore */ }

  // Blocks table - users blocking other users
  await execSQL(`
    CREATE TABLE IF NOT EXISTS blocks (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      blocker_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      blocked_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  // Block list by phone (10-digit US national) — works before the other person signs up
  await execSQL(`
    CREATE TABLE IF NOT EXISTS blocked_phone_numbers (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      blocker_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      phone_national_10 ${usePostgres ? 'VARCHAR(10)' : 'TEXT'} NOT NULL,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id, phone_national_10)
    )
  `);

  // Reports table - user A reports user B (for moderation)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS reports (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      reporter_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      reported_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      reason ${usePostgres ? 'VARCHAR(500)' : 'TEXT'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
    )
  `);

  // Add last_active_at to users table if it doesn't exist
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN last_active_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add show_active_status to users table (when false, others don't see last_active_at)
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN show_active_status ${usePostgres ? 'BOOLEAN DEFAULT true' : 'INTEGER DEFAULT 1'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Push notification preferences (1 = enabled, 0 = disabled; default on)
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN push_notify_matches ${usePostgres ? 'INT DEFAULT 1' : 'INTEGER DEFAULT 1'}`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN push_notify_messages ${usePostgres ? 'INT DEFAULT 1' : 'INTEGER DEFAULT 1'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Payments table - tracks token purchases via Stripe
  await execSQL(`
    CREATE TABLE IF NOT EXISTS payments (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      payment_intent_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE NOT NULL,
      amount_cents ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      tokens_to_grant ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      package_id ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      status ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} DEFAULT 'pending',
      token_ids ${usePostgres ? 'TEXT' : 'TEXT'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      tokens_granted_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      failed_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Authorize.Net / Accept Hosted: pending web checkouts (invoice id = session id, max 20 chars)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS web_checkout_sessions (
      id ${usePostgres ? 'VARCHAR(20)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      package_id ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      tokens ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      amount_cents ${usePostgres ? 'INT' : 'INTEGER'} NOT NULL,
      status ${usePostgres ? 'VARCHAR(20)' : 'TEXT'} DEFAULT 'pending',
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_web_checkout_user ON web_checkout_sessions(user_id)`);

  // Web Push (PWA / browser) — separate from Expo native push_token
  await execSQL(`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      endpoint ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL UNIQUE,
      p256dh ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      auth ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON web_push_subscriptions(user_id)`);

  // SUCCESS SIGNAL TRACKING: Track real success indicators for learning
  // Success signals: match creation, message engagement, stage advancement
  await execSQL(`
    CREATE TABLE IF NOT EXISTS success_signals (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      matched_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      signal_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} NOT NULL,
      signal_value ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 1,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (matched_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);
  
  // Index for fast queries
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_user_id ON success_signals(user_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_match_id ON success_signals(match_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_type ON success_signals(signal_type)`);

  // PERFORMANCE: Add indexes for frequently queried columns
  console.log("📊 Creating database indexes for performance...");
  
  try {
    // Profiles table indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles(age)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender)`);
    
    // Interests table indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_interests_profile_id ON interests(profile_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_interests_name ON interests(name)`);
    
    // Partner qualities indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_partner_qualities_profile_id ON partner_qualities(profile_id)`);
    
    // Lifestyle indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_lifestyle_profile_id ON lifestyle(profile_id)`);
    
    // Dealbreakers indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_dealbreakers_profile_id ON dealbreakers(profile_id)`);
    
    // Preferences indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_preferences_profile_id ON preferences(profile_id)`);
    
    // Matches indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_matches_user1_id ON matches(user1_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_matches_user2_id ON matches(user2_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches(stage)`);
    
    // Blocks indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON blocks(blocker_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks(blocked_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_blocked_phone_blocker ON blocked_phone_numbers(blocker_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_blocked_phone_national ON blocked_phone_numbers(phone_national_10)`);

    // Reports indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id)`);
    
    // Messages indexes
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`);
    
    // Success signals indexes (for learning from real engagement)
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_user_id ON success_signals(user_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_match_id ON success_signals(match_id)`);
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_success_signals_type ON success_signals(signal_type)`);
    
    // Users last_active_at index
    await execSQL(`CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at)`);
    
    console.log("✅ Database indexes created successfully");

  // ============================================
  // NEW FEATURES: Compatibility Pulse, Mulligan Moments, Date Blueprint
  // ============================================

  // Compatibility Pulse: Track real-time connection scores
  await execSQL(`
    CREATE TABLE IF NOT EXISTS compatibility_scores (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      user1_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      user2_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      score ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 50.0,
      response_time_avg ${usePostgres ? 'INT' : 'INTEGER'},
      message_length_avg ${usePostgres ? 'INT' : 'INTEGER'},
      engagement_level ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} DEFAULT 'neutral',
      last_calculated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(match_id)
    )
  `);

  // Compatibility score history (for tracking trends)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS compatibility_score_history (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      score ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} NOT NULL,
      recorded_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);

  // Mulligan Moments: Track conversation resets
  await execSQL(`
    CREATE TABLE IF NOT EXISTS conversation_resets (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      initiated_by ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      reset_reason ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      ai_generated_starter ${usePostgres ? 'TEXT' : 'TEXT'},
      shared_interests_used ${usePostgres ? 'TEXT' : 'TEXT'},
      token_used ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 1,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Never Have I Ever: Game state per match
  await execSQL(`
    CREATE TABLE IF NOT EXISTS never_have_i_ever_games (
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user1_strikes ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      user2_strikes ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      user1_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      user2_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      spice_level ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      current_prompt ${usePostgres ? 'TEXT' : 'TEXT'},
      current_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      current_turn_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      user1_answer ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      user2_answer ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      user1_answer_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      user2_answer_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      updated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN current_turn_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user1_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user2_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN spice_level ${usePostgres ? 'VARCHAR(20)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN current_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user1_answer_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user2_answer_round_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user1_last_active_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN user2_last_active_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE never_have_i_ever_games ADD COLUMN used_prompts ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) { /* exists */ }

  // Truth or Dare: Game state per match (lobby for spice level agreement)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS truth_or_dare_games (
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user1_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      user2_spice_choice ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      spice_level ${usePostgres ? 'VARCHAR(20)' : 'TEXT'},
      current_turn_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      round_count ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 1,
      updated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN current_turn_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN round_count ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 1`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN current_prompt ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN current_prompt_type ${usePostgres ? 'VARCHAR(20)' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN used_prompts ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN user1_another_one_count ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) { /* exists */ }
  try {
    await execSQL(`ALTER TABLE truth_or_dare_games ADD COLUMN user2_another_one_count ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) { /* exists */ }

  // Game unlocks: when a user spends a Mulligan token to unlock a game for a match (alternative to 10 messages each)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS game_unlocks (
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      game_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} NOT NULL,
      unlocked_by_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      unlocked_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      unlocked_until ${usePostgres ? 'TIMESTAMP' : 'DATETIME'},
      PRIMARY KEY (match_id, game_type),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (unlocked_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  try {
    await execSQL(`ALTER TABLE game_unlocks ADD COLUMN unlocked_until ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) { /* exists */ }

  // Game requests: when User A invites User B to play Truth or Dare or Never Have I Ever
  await execSQL(`
    CREATE TABLE IF NOT EXISTS game_requests (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      from_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      to_user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      game_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} NOT NULL,
      status ${usePostgres ? 'VARCHAR(20)' : 'TEXT'} DEFAULT 'pending',
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Date Blueprint: Store AI-generated date plans (title/venue can be long from AI)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS date_plans (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      suggested_by ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      plan_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} DEFAULT 'first_date',
      title ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      description ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      venue_name ${usePostgres ? 'TEXT' : 'TEXT'},
      venue_address ${usePostgres ? 'TEXT' : 'TEXT'},
      venue_lat ${usePostgres ? 'DECIMAL(10,8)' : 'REAL'},
      venue_lng ${usePostgres ? 'DECIMAL(11,8)' : 'REAL'},
      suggested_date ${usePostgres ? 'DATE' : 'DATE'},
      suggested_time ${usePostgres ? 'TIME' : 'TIME'},
      budget_range ${usePostgres ? 'VARCHAR(50)' : 'TEXT'},
      conversation_topics ${usePostgres ? 'TEXT' : 'TEXT'},
      status ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} DEFAULT 'pending',
      user1_accepted ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      user2_accepted ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      user1_modifications ${usePostgres ? 'TEXT' : 'TEXT'},
      user2_modifications ${usePostgres ? 'TEXT' : 'TEXT'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (suggested_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Indexes for new tables
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_compatibility_scores_match_id ON compatibility_scores(match_id)`);

  // Fix compatibility_scores.score column type if it's INTEGER (migration for existing tables)
  if (usePostgres && pgPool) {
    try {
      // Check if table exists and get column type
      const tableResult = await pgPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'compatibility_scores'
        )
      `);
      
      if (tableResult.rows[0]?.exists) {
        // Check current column type
        const colResult = await pgPool.query(`
          SELECT data_type, udt_name
          FROM information_schema.columns 
          WHERE table_name = 'compatibility_scores' 
          AND column_name = 'score'
        `);
        
        const colInfo = colResult.rows[0];
        const dataType = colInfo?.data_type;
        const udtName = colInfo?.udt_name;
        
        // Check if it's an integer type (int4, integer, etc.)
        if (dataType === 'integer' || dataType === 'int4' || udtName === 'int4' || udtName === 'integer') {
          // Column is INTEGER, need to convert it
          console.log('🔄 Converting compatibility_scores.score from INTEGER to DECIMAL(5,2)...');
          try {
            await pgPool.query(`
              ALTER TABLE compatibility_scores 
              ALTER COLUMN score TYPE DECIMAL(5,2) 
              USING score::DECIMAL(5,2)
            `);
            console.log('✅ Updated compatibility_scores.score column type to DECIMAL(5,2)');
          } catch (alterErr: any) {
            console.error('❌ Failed to alter compatibility_scores.score column:', alterErr?.message || alterErr);
            // Try alternative approach - drop and recreate column
            try {
              console.log('🔄 Trying alternative: dropping and recreating column...');
              await pgPool.query(`ALTER TABLE compatibility_scores DROP COLUMN score`);
              await pgPool.query(`ALTER TABLE compatibility_scores ADD COLUMN score DECIMAL(5,2) DEFAULT 50.0`);
              console.log('✅ Recreated compatibility_scores.score column as DECIMAL(5,2)');
            } catch (dropErr: any) {
              console.error('❌ Failed to recreate column:', dropErr?.message || dropErr);
            }
          }
        } else if (dataType === 'numeric' || dataType?.includes('decimal') || udtName === 'numeric') {
          console.log('ℹ️ compatibility_scores.score column is already DECIMAL');
        } else {
          console.log(`ℹ️ compatibility_scores.score column type: ${dataType} (${udtName})`);
        }
      }
    } catch (err: any) {
      // Table might not exist yet, or column might not exist - that's okay
      if (!err?.message?.includes('does not exist') && !err?.message?.includes('column')) {
        console.warn('⚠️ Could not check/alter compatibility_scores.score column:', err?.message || err);
      }
    }
    
    // Also fix compatibility_score_history.score column
    try {
      const tableResult = await pgPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'compatibility_score_history'
        )
      `);
      
      if (tableResult.rows[0]?.exists) {
        const colResult = await pgPool.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'compatibility_score_history' 
          AND column_name = 'score'
        `);
        
        const dataType = colResult.rows[0]?.data_type;
        if (dataType === 'integer' || dataType === 'int4') {
          console.log('🔄 Converting compatibility_score_history.score from INTEGER to DECIMAL(5,2)...');
          await pgPool.query(`
            ALTER TABLE compatibility_score_history 
            ALTER COLUMN score TYPE DECIMAL(5,2) 
            USING score::DECIMAL(5,2)
          `);
          console.log('✅ Updated compatibility_score_history.score column type to DECIMAL(5,2)');
        } else if (dataType === 'numeric' || dataType?.includes('decimal')) {
          console.log('ℹ️ compatibility_score_history.score column is already DECIMAL');
        }
      }
    } catch (err: any) {
      if (!err?.message?.includes('does not exist') && !err?.message?.includes('column')) {
        console.warn('⚠️ Could not check/alter compatibility_score_history.score column:', err?.message || err);
      }
    }
  }
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_compatibility_score_history_match_id ON compatibility_score_history(match_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_conversation_resets_match_id ON conversation_resets(match_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_date_plans_match_id ON date_plans(match_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_date_plans_status ON date_plans(status)`);

  console.log("✅ New feature tables created: compatibility_scores, conversation_resets, date_plans");

  // ============================================
  // CONNECTION QUALITY SCORE
  // ============================================

  // Connection Quality Score: Track user's overall dating success metrics
  await execSQL(`
    CREATE TABLE IF NOT EXISTS connection_quality_scores (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL UNIQUE,
      score ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 50.0,
      match_to_conversation_rate ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      conversation_depth_avg ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      response_time_consistency ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      profile_completeness ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      date_success_rate ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      second_date_rate ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      monthly_improvement ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} DEFAULT 0,
      last_calculated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Connection Quality Score History (for trends)
  await execSQL(`
    CREATE TABLE IF NOT EXISTS connection_quality_history (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      score ${usePostgres ? 'DECIMAL(5,2)' : 'REAL'} NOT NULL,
      recorded_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ============================================
  // MATCH MEMORY BANK
  // ============================================

  // Match Reflections: User's private journal of dating experiences
  await execSQL(`
    CREATE TABLE IF NOT EXISTS match_reflections (
      id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      user_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      match_id ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      reflection_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'} NOT NULL,
      title ${usePostgres ? 'VARCHAR(255)' : 'TEXT'},
      content ${usePostgres ? 'TEXT' : 'TEXT'} NOT NULL,
      tags ${usePostgres ? 'TEXT' : 'TEXT'},
      date_type ${usePostgres ? 'VARCHAR(50)' : 'TEXT'},
      second_date_planned ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      insights ${usePostgres ? 'TEXT' : 'TEXT'},
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
    )
  `);

  // Indexes for new tables
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_connection_quality_scores_user_id ON connection_quality_scores(user_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_connection_quality_history_user_id ON connection_quality_history(user_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_connection_quality_history_recorded_at ON connection_quality_history(recorded_at)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_match_reflections_user_id ON match_reflections(user_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_match_reflections_match_id ON match_reflections(match_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_match_reflections_created_at ON match_reflections(created_at)`);

  console.log("✅ Connection Quality Score and Match Memory Bank tables created");
  } catch (e) {
    console.warn("⚠️  Some indexes may already exist or failed to create:", e);
  }

  // Migration: ensure long-content columns are TEXT not VARCHAR(255) (fixes "value too long" on prompts/messages)
  if (usePostgres && pgPool) {
    const alterToText = async (table: string, column: string) => {
      try {
        // USING ensures varchar(255) etc. cast correctly to TEXT
        await pgPool!.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TEXT USING ${column}::TEXT`);
        console.log(`✅ Migration: ${table}.${column} -> TEXT`);
      } catch (e: any) {
        if (e?.code !== '42701' && !e?.message?.includes('already')) {
          console.warn(`⚠️  Migration ${table}.${column}:`, e?.message || e);
        }
      }
    };
    await alterToText('messages', 'content');
    await alterToText('truth_or_dare_games', 'current_prompt');
    await alterToText('truth_or_dare_games', 'used_prompts');
    await alterToText('never_have_i_ever_games', 'current_prompt');
    await alterToText('date_plans', 'title');
    await alterToText('date_plans', 'description');
    await alterToText('date_plans', 'venue_name');
    await alterToText('date_plans', 'venue_address');
    await alterToText('date_plans', 'conversation_topics');
  }

  try {
    await execSQL(`ALTER TABLE date_plans ADD COLUMN is_proposed ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execSQL(`ALTER TABLE date_plans ADD COLUMN proposed_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execSQL(`ALTER TABLE date_plans ADD COLUMN lane_id ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execSQL(`ALTER TABLE messages ADD COLUMN date_plan_id ${usePostgres ? 'TEXT' : 'TEXT'}`);
  } catch (e) {
    // Column already exists
  }

  try {
    const { syncAccountStatusFromProfileReadiness } = await import('./utils/accountStatus.js');
    await syncAccountStatusFromProfileReadiness();
    console.log('✅ User account_status synced from profile readiness');
  } catch (e) {
    console.warn('⚠️  account_status sync skipped:', e);
  }

  try {
    const { unhideLegacyAutoHiddenFromBrowsePhones } = await import(
      './config/hiddenFromBrowse.js',
    );
    const n = await unhideLegacyAutoHiddenFromBrowsePhones();
    if (n > 0) {
      console.log(`✅ hidden_from_browse cleared for ${n} legacy internal phone account(s)`);
    }
  } catch (e) {
    console.warn('⚠️  legacy hidden_from_browse unhide skipped:', e);
  }

  console.log("✅ Database initialized");
}
