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

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
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
      const user = db.prepare('SELECT is_restricted FROM users WHERE id = ?').get(req.userId) as { is_restricted: number } | undefined;
      
      if (user && user.is_restricted === 1) {
        return res.status(403).json({ error: 'Your account has been restricted. Please contact support at Mulligandating@gmail.com' });
      }
      
      // Update last active timestamp
      db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.userId);
    }
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Admin authentication middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { db } = require('../database.js');
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId) as { is_admin: number } | undefined;
    
    if (!user || user.is_admin !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

