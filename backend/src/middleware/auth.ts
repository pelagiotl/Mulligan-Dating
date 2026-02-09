import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Validate JWT secret on module load
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    console.error('❌ JWT_SECRET environment variable is not set!');
    console.error('   Set it in your .env file with a strong random string (min 32 characters)');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return 'mulligan-secret-key-change-in-production'; // Fallback for development only
  }
  
  if (secret.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is too short (minimum 32 characters recommended)');
    if (process.env.NODE_ENV === 'production') {
      console.error('   Production requires a strong JWT_SECRET. Exiting...');
      process.exit(1);
    }
  }
  
  if (secret === 'mulligan-secret-key-change-in-production') {
    console.error('❌ CRITICAL: Using default JWT_SECRET! This is insecure!');
    console.error('   Set a strong JWT_SECRET in your .env file');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
  
  return secret;
}

const JWT_SECRET = getJWTSecret();

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    
    // Check if user is restricted
    if (req.userId) {
      const { db } = require('../database.js');
      const userStmt = db.prepare('SELECT is_restricted FROM users WHERE id = ?');
      const user = await (userStmt.get(req.userId) as Promise<{ is_restricted: number } | null>);
      
      if (user && user.is_restricted === 1) {
        return res.status(403).json({ error: 'Your account has been restricted. Please contact support at Mulligandating@gmail.com' });
      }
      
      // Update last active timestamp
      const updateStmt = db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?');
      await (updateStmt.run([req.userId]) as Promise<any>);

      // Save push token from header if present (fallback when POST /auth/push-token never runs or fails)
      const rawPushToken = req.headers['x-push-token'];
      if (rawPushToken && typeof rawPushToken === 'string' && rawPushToken.trim().length > 0) {
        const pushToken = rawPushToken.trim();
        if (pushToken.startsWith('ExponentPushToken[') && pushToken.length > 30) {
          try {
            const existingResult = db.prepare('SELECT push_token FROM users WHERE id = ?').get(req.userId);
            const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as { push_token: string | null } | undefined;
            const hadToken = !!(existing?.push_token && existing.push_token.trim().length > 0);
            const runResult = db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run([pushToken, req.userId]);
            if (runResult instanceof Promise) await runResult;
            const verifyResult = db.prepare('SELECT push_token FROM users WHERE id = ?').get(req.userId);
            const verify = (verifyResult instanceof Promise ? await verifyResult : verifyResult) as { push_token: string | null } | undefined;
            const persisted = !!(verify?.push_token && verify.push_token.length > 0);
            if (!hadToken) {
              console.log(`📲 Push token saved from request header for user ${req.userId} (was missing). Persisted: ${persisted}`);
            }
          } catch (e) {
            // non-critical
          }
        }
      }
    }
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Owner phone number - always has admin access
const OWNER_PHONE_DIGITS = '5413163939';

// Additional admin phones from env (comma-separated, digits only)
function getAdminPhones(): string[] {
  const raw = process.env.ADMIN_PHONES || '';
  return raw.split(',').map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 10);
}

// Admin user IDs from env (comma-separated) – bypasses phone check
function getAdminUserIds(): string[] {
  const raw = process.env.ADMIN_USER_IDS || '';
  return raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}

// Admin authentication middleware
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { db } = require('../database.js');
    const userStmt = db.prepare('SELECT is_admin, phone_number FROM users WHERE id = ?');
    const user = await (userStmt.get(req.userId) as Promise<{ is_admin: number; phone_number: string | null } | null>);
    
    if (!user) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const isDbAdmin = user.is_admin === 1;
    const adminUserIds = getAdminUserIds();
    const isAdminById = adminUserIds.includes(req.userId);
    const phoneDigits = (user.phone_number || '').replace(/\D/g, '');
    const isOwnerPhone = phoneDigits === OWNER_PHONE_DIGITS || phoneDigits === '1' + OWNER_PHONE_DIGITS;
    const adminPhones = getAdminPhones();
    const isAdminByPhone = adminPhones.some((ap) => phoneDigits === ap || phoneDigits === '1' + ap);
    
    if (!isDbAdmin && !isAdminById && !isOwnerPhone && !isAdminByPhone) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

