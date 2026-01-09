// Database adapter that supports both SQLite (dev) and PostgreSQL (production)
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { Pool, QueryResult } from "pg";
import path from "path";

// Determine which database to use
const usePostgres = !!process.env.DATABASE_URL;

let sqliteDb: DatabaseType | null = null;
let pgPool: Pool | null = null;

// Initialize SQLite (for local development)
function initSQLite() {
  const dbPath = process.env.DATABASE_PATH || 
    (process.env.NODE_ENV === 'production' 
      ? path.join(process.cwd(), "..", "mulligan.db")
      : path.join(process.cwd(), "mulligan.db"));
  
  console.log('📁 Using SQLite database at:', dbPath);
  sqliteDb = new Database(dbPath);
  return sqliteDb;
}

// Initialize PostgreSQL (for production)
function initPostgres() {
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
  
  return pgPool;
}

// Database interface
export interface DbAdapter {
  // Execute a query and return results
  query(sql: string, params?: any[]): Promise<any[]>;
  // Execute a query and return a single row
  queryOne(sql: string, params?: any[]): Promise<any | null>;
  // Execute a query that doesn't return results (INSERT, UPDATE, DELETE)
  execute(sql: string, params?: any[]): Promise<void>;
  // Get a prepared statement (for SQLite compatibility)
  prepare(sql: string): {
    get: (params?: any) => any;
    run: (params?: any) => { lastInsertRowid: number; changes: number };
    all: (params?: any) => any[];
  };
}

// SQLite adapter
class SQLiteAdapter implements DbAdapter {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(params) as any[];
  }

  async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    const stmt = this.db.prepare(sql);
    const result = stmt.get(params);
    return result || null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(params);
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }
}

// PostgreSQL adapter
class PostgresAdapter implements DbAdapter {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    // Convert SQLite placeholders (?) to PostgreSQL placeholders ($1, $2, etc.)
    const pgSql = sql.replace(/\?/g, (_, offset) => {
      const paramIndex = (sql.substring(0, offset).match(/\?/g) || []).length + 1;
      return `$${paramIndex}`;
    });
    
    const result = await this.pool.query(pgSql, params);
    return result.rows;
  }

  async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.query(sql, params);
  }

  prepare(sql: string) {
    // PostgreSQL doesn't have prepared statements in the same way
    // Return a mock object that works with the existing code
    const pgSql = sql.replace(/\?/g, (_, offset) => {
      const paramIndex = (sql.substring(0, offset).match(/\?/g) || []).length + 1;
      return `$${paramIndex}`;
    });
    
    return {
      get: async (params: any[] = []) => {
        const result = await this.pool.query(pgSql, params);
        return result.rows[0] || null;
      },
      run: async (params: any[] = []) => {
        await this.pool.query(pgSql, params);
        return { lastInsertRowid: 0, changes: 0 }; // PostgreSQL doesn't return this easily
      },
      all: async (params: any[] = []) => {
        const result = await this.pool.query(pgSql, params);
        return result.rows;
      }
    };
  }
}

// Initialize and export the database adapter
let db: DbAdapter;

if (usePostgres) {
  const pool = initPostgres();
  db = new PostgresAdapter(pool);
} else {
  const sqlite = initSQLite();
  db = new SQLiteAdapter(sqlite);
}

export { db, usePostgres };

// Export types for compatibility
export type { DatabaseType };

