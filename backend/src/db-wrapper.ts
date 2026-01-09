// Database wrapper that provides a unified interface for both SQLite and PostgreSQL
// This allows the existing code to work with minimal changes

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { Pool } from "pg";
import path from "path";

const usePostgres = !!process.env.DATABASE_URL;

let sqliteDb: DatabaseType | null = null;
let pgPool: Pool | null = null;

// Initialize SQLite
if (!usePostgres) {
  const dbPath = process.env.DATABASE_PATH || 
    (process.env.NODE_ENV === 'production' 
      ? path.join(process.cwd(), "..", "mulligan.db")
      : path.join(process.cwd(), "mulligan.db"));
  
  console.log('📁 Using SQLite database at:', dbPath);
  sqliteDb = new Database(dbPath);
} else {
  // Initialize PostgreSQL
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }
  
  console.log('🐘 Using PostgreSQL database');
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
}

// Create a wrapper that makes PostgreSQL look like SQLite
class PostgresWrapper {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  exec(sql: string) {
    // Convert SQLite syntax to PostgreSQL
    const pgSql = this.convertSQL(sql);
    // Execute synchronously (this is a limitation, but works for init)
    // For production, we'll need async support
    return this.pool.query(pgSql).catch(err => {
      console.error('SQL Error:', err);
      throw err;
    });
  }

  prepare(sql: string) {
    const pgSql = this.convertSQL(sql);
    return {
      get: (params: any[] = []) => {
        // This is async but we'll handle it
        return this.pool.query(pgSql, params).then(result => result.rows[0] || null);
      },
      run: (params: any[] = []) => {
        return this.pool.query(pgSql, params).then(() => ({ lastInsertRowid: 0, changes: 0 }));
      },
      all: (params: any[] = []) => {
        return this.pool.query(pgSql, params).then(result => result.rows);
      }
    };
  }

  private convertSQL(sql: string): string {
    // Convert SQLite placeholders (?) to PostgreSQL ($1, $2, etc.)
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
  }
}

// Export db - either SQLite or PostgreSQL wrapper
export const db: DatabaseType | PostgresWrapper = usePostgres 
  ? (new PostgresWrapper(pgPool!) as any)
  : sqliteDb!;

export type { DatabaseType };

