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
  
  pgPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
    
    // Convert TEXT to VARCHAR(255) for PostgreSQL
    pgSql = pgSql.replace(/\bTEXT\b/g, 'VARCHAR(255)');
    
    // Handle IF NOT EXISTS - PostgreSQL supports it
    // Keep it as is
    
    return pgSql;
  }

  // Create a PostgreSQL statement that looks like SQLite
  private createPostgresStatement(sql: string) {
    // Convert ? placeholders to $1, $2, etc.
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // Helper to normalize params (handle both single value and array)
    const normalizeParams = (params: any): any[] => {
      if (params === undefined || params === null) {
        return [];
      }
      if (Array.isArray(params)) {
        return params;
      }
      return [params];
    };
    
    return {
      get: async (params?: any) => {
        const normalizedParams = normalizeParams(params);
        const result = await pgPool!.query(pgSql, normalizedParams);
        return result.rows[0] || null;
      },
      run: async (params?: any) => {
        const normalizedParams = normalizeParams(params);
        await pgPool!.query(pgSql, normalizedParams);
        return { lastInsertRowid: 0, changes: 0 };
      },
      all: async (params?: any) => {
        const normalizedParams = normalizeParams(params);
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
      email ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE NOT NULL,
      password ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      is_premium ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0,
      referral_code ${usePostgres ? 'VARCHAR(255)' : 'TEXT'} UNIQUE,
      created_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add columns if they don't exist (migration)
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN is_premium ${usePostgres ? 'INT' : 'INTEGER'} DEFAULT 0`);
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
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  // Mulligan Tokens table - users get 3 tokens per week (max 3 at a time)
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
  // Stages: pending (one side sent), stage1 (mutual match, no photos), stage2 (photos revealed), expired
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

  // Add last_active_at to users table if it doesn't exist
  try {
    await execSQL(`ALTER TABLE users ADD COLUMN last_active_at ${usePostgres ? 'TIMESTAMP' : 'DATETIME'}`);
  } catch (e) {
    // Column already exists, ignore
  }

  console.log("✅ Database initialized");
}
