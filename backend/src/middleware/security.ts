import { Request, Response, NextFunction } from 'express';

// Try to import rate limiter (optional dependency)
let RateLimiterMemory: any = null;
try {
  const rateLimiterModule = require('rate-limiter-flexible');
  RateLimiterMemory = rateLimiterModule.RateLimiterMemory;
} catch (error) {
  console.warn('⚠️  rate-limiter-flexible not installed. Rate limiting disabled.');
  console.warn('   Install with: cd backend && npm install rate-limiter-flexible');
}

// Rate limiter for authentication endpoints (prevent brute force)
// More lenient in development, less strict in production to handle shared IPs (load balancers)
const authLimiter = RateLimiterMemory ? new RateLimiterMemory({
  points: process.env.NODE_ENV === 'production' ? 50 : 100, // 50 attempts in prod (increased from 20), 100 in dev
  duration: 900, // per 15 minutes
  blockDuration: process.env.NODE_ENV === 'production' ? 60 : 10, // 1 min in prod (reduced from 5 min), 10 sec in dev
}) : null;

// Rate limiter for signup endpoint (more lenient than login)
// Signup is less security-critical than login, so we allow more attempts
const signupLimiter = RateLimiterMemory ? new RateLimiterMemory({
  points: process.env.NODE_ENV === 'production' ? 50 : 200, // 50 signups in prod, 200 in dev
  duration: 900, // per 15 minutes
  blockDuration: process.env.NODE_ENV === 'production' ? 60 : 5, // 1 min in prod, 5 sec in dev
}) : null;

// Rate limiter for general API endpoints (per IP; authenticated routes see high traffic per user)
// Set high enough for 500–1000 concurrent users: many IPs get their own bucket; shared IPs (e.g. office WiFi) share one.
const apiLimiter = RateLimiterMemory ? new RateLimiterMemory({
  points: process.env.NODE_ENV === 'production' ? 1200 : 200, // 1200 req/15 min per IP in prod (~80/min) for launch; 200 in dev
  duration: 900, // per 15 minutes
}) : null;

// Rate limiter for admin endpoints (stricter)
const adminLimiter = RateLimiterMemory ? new RateLimiterMemory({
  points: 50, // 50 requests
  duration: 900, // per 15 minutes
}) : null;

export async function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  if (!authLimiter) {
    // Rate limiting not available, skip
    return next();
  }
  
  // In development, allow bypass for localhost
  if (process.env.NODE_ENV !== 'production') {
    const ip = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || '';
    const ipString = Array.isArray(ip) ? ip[0] : String(ip);
    
    // Check for localhost in various formats
    if (
      ipString === '::1' || 
      ipString === '127.0.0.1' || 
      ipString.startsWith('::ffff:127.0.0.1') || 
      ipString === 'localhost' ||
      ipString.includes('127.0.0.1') ||
      ipString === ''
    ) {
      // Allow localhost in development - bypass rate limiting
      return next();
    }
  }
  
  // Don't consume auth limit for read/register endpoints called on every app open (req.path is relative to mount /api/auth)
  const p = (req.path || '').replace(/\/$/, '');
  if (req.method === 'GET' && (p === '/me' || p === 'me')) return next();
  if (req.method === 'POST' && (p === '/push-token' || p === 'push-token' || p === '/web-push-subscription' || p === 'web-push-subscription')) return next();

  try {
    // For login attempts, use email + IP to avoid shared IP issues behind load balancers
    // This allows multiple users from the same IP to login independently
    let key: string;
    // Check if this is a login request by checking path or originalUrl
    const isLoginRequest = req.method === 'POST' && 
      (req.path === '/login' || req.path.endsWith('/login') || req.originalUrl?.includes('/auth/login'));
    
    if (isLoginRequest && req.body?.email) {
      // Use email + IP for login to avoid shared IP rate limiting
      const email = String(req.body.email).toLowerCase().trim();
      const xForwardedFor = req.headers['x-forwarded-for'];
      const ip = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
      const ipString = Array.isArray(ip) ? ip[0] : String(ip);
      key = `login:${email}:${ipString}`;
    } else {
      // For other auth endpoints, just use IP
      const xForwardedFor = req.headers['x-forwarded-for'];
      const ip = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
      const ipString = Array.isArray(ip) ? ip[0] : String(ip);
      key = ipString;
    }
    
    await authLimiter.consume(key);
    next();
  } catch (rejRes: any) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: `Please try again in ${secs} seconds`,
      retryAfter: secs,
    });
  }
}

// Rate limiter for signup endpoint (more lenient than login)
export async function rateLimitSignup(req: Request, res: Response, next: NextFunction) {
  if (!signupLimiter) {
    // Rate limiting not available, skip
    return next();
  }
  
  // In development, allow bypass for localhost
  if (process.env.NODE_ENV !== 'production') {
    const ip = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || '';
    const ipString = Array.isArray(ip) ? ip[0] : String(ip);
    
    // Check for localhost in various formats
    if (
      ipString === '::1' || 
      ipString === '127.0.0.1' || 
      ipString.startsWith('::ffff:127.0.0.1') || 
      ipString === 'localhost' ||
      ipString.includes('127.0.0.1') ||
      ipString === ''
    ) {
      // Allow localhost in development - bypass rate limiting
      return next();
    }
  }
  
  try {
    const key = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const keyString = Array.isArray(key) ? key[0] : String(key);
    await signupLimiter.consume(keyString);
    next();
  } catch (rejRes: any) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.status(429).json({
      error: 'Too many signup attempts',
      message: `Please try again in ${secs} seconds`,
      retryAfter: secs,
    });
  }
}

// Helper function to reset rate limit for a specific IP (for development/admin use)
export async function resetAuthRateLimit(ip: string): Promise<void> {
  if (authLimiter && ip) {
    try {
      // Try to delete with the IP as-is
      await authLimiter.delete(ip);
      
      // Also try common IP variations
      if (ip.includes('127.0.0.1') || ip === '::1' || ip === 'localhost') {
        await authLimiter.delete('127.0.0.1');
        await authLimiter.delete('::1');
        await authLimiter.delete('::ffff:127.0.0.1');
      }
      
      // In development, also try to reset all rate limits
      if (process.env.NODE_ENV !== 'production') {
        // Reset all keys (this is a workaround - rate-limiter-flexible doesn't have a clearAll method)
        // We'll just delete common variations
        const commonKeys = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', 'unknown'];
        for (const key of commonKeys) {
          try {
            await authLimiter.delete(key);
          } catch {
            // Ignore errors for keys that don't exist
          }
        }
      }
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
    }
  }
}

export async function rateLimitAPI(req: Request, res: Response, next: NextFunction) {
  if (!apiLimiter) {
    // Rate limiting not available, skip
    return next();
  }
  
  // Skip rate limiting for admin routes (they have their own limiter or are trusted)
  // Admin routes are at /api/admin, so check for /admin in the path
  if (req.path.includes('/admin')) {
    return next();
  }

  // High-frequency or startup requests: don't consume from main limit to avoid 429
  if (req.method === 'GET') {
    if (req.path === '/tokens' || req.path === '/tokens/') return next();
    if (req.path === '/auth/me' || req.path === '/auth/me/') return next(); // Called on every app open
    if (req.path === '/photos/me' || req.path.startsWith('/photos/profile/')) return next(); // Loaded on profile/app open
    // Polling: Never Have I Ever state (every few s when modal open) and messages (chat)
    if (/^\/matches\/[^/]+\/never-have-i-ever\/?$/.test(req.path)) return next();
    if (/^\/matches\/[^/]+\/messages\/?$/.test(req.path)) return next();
  }
  if (req.method === 'POST' && (req.path === '/auth/push-token' || req.path === '/auth/push-token/' ||
      req.path === '/auth/web-push-subscription' || req.path === '/auth/web-push-subscription/')) {
    return next(); // Called on every app open and with retries; don't burn API limit
  }
  // SMS login flow: don't consume API limit so users can always request/verify code (still limited by rateLimitAuth per IP)
  if (req.method === 'POST' && (req.path === '/sms/send-code' || req.path === '/sms/verify-code' ||
      req.path === '/sms/send-code/' || req.path === '/sms/verify-code/')) {
    return next();
  }

  // For profile creation/update endpoints, use a more lenient rate limit
  // Profile creation involves multiple requests (interests, dealbreakers, preferences, etc.)
  if (req.path.includes('/profile') && (req as any).userId) {
    // Use a separate, more lenient limiter for profile operations
    // This allows users to complete profile creation without hitting rate limits
    const profileLimiter = RateLimiterMemory ? new RateLimiterMemory({
      points: 50, // 50 profile operations
      duration: 60, // per minute (resets quickly)
    }) : null;
    
    if (profileLimiter) {
      try {
        const profileKey = `profile:${(req as any).userId}`;
        await profileLimiter.consume(profileKey);
        return next();
      } catch (rejRes: any) {
        // If profile limiter fails, fall through to regular limiter
        // This gives users a second chance
      }
    }
  }
  
  // For authenticated routes, use user ID instead of IP to avoid shared rate limits
  // This prevents all users behind a proxy/load balancer from sharing the same limit
  let key: string;
  if ((req as any).userId) {
    // Authenticated request - use user ID
    key = `user:${(req as any).userId}`;
  } else {
    // Unauthenticated request - use IP
    const forwardedFor = req.headers['x-forwarded-for'];
    const ipFromHeader = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ip = req.ip || req.socket.remoteAddress || ipFromHeader || 'unknown';
    key = Array.isArray(ip) ? ip[0] : String(ip);
  }
  
  try {
    await apiLimiter.consume(key);
    next();
  } catch (rejRes: any) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.status(429).json({
      error: 'Too many requests',
      message: `Please try again in ${secs} seconds`,
      retryAfter: secs,
    });
  }
}

export async function rateLimitAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminLimiter) {
    // Rate limiting not available, skip
    return next();
  }
  
  try {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    await adminLimiter.consume(key);
    next();
  } catch (rejRes: any) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.status(429).json({
      error: 'Too many admin requests',
      message: `Please try again in ${secs} seconds`,
      retryAfter: secs,
    });
  }
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_HTTPS === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
  );
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

// Input sanitization helper with XSS prevention
export function sanitizeInput(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length (prevent DoS)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // XSS Prevention: Escape HTML entities
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  return sanitized;
}

// Sanitize text input (allows some formatting, removes dangerous HTML)
export function sanitizeText(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Remove dangerous HTML tags and attributes (basic XSS prevention)
  // Allow only safe characters, remove script tags, event handlers, etc.
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframes
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers (onclick, onerror, etc.)
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:text\/html/gi, '') // Remove data URIs with HTML
    .replace(/<[^>]+>/g, ''); // Remove all remaining HTML tags
  
  return sanitized;
}

// Sanitize array of strings
export function sanitizeArray(input: string[], maxLength: number = 100, maxItems: number = 50): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  
  // Limit number of items
  const limited = input.slice(0, maxItems);
  
  // Sanitize each item
  return limited.map(item => {
    if (typeof item !== 'string') {
      return '';
    }
    return sanitizeText(item, maxLength);
  }).filter(item => item.length > 0); // Remove empty items
}

// Validate JWT secret strength
export function validateJWTSecret(): void {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    console.error('❌ JWT_SECRET environment variable is not set!');
    console.error('   Set it in your .env file with a strong random string (min 32 characters)');
    console.error('   Generate one with: openssl rand -base64 32');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  } else if (jwtSecret.length < 32) {
    console.error('⚠️  WARNING: JWT_SECRET is too short (minimum 32 characters recommended)');
    console.error('   Generate a strong secret with: openssl rand -base64 32');
    if (process.env.NODE_ENV === 'production') {
      console.error('   Production requires a strong JWT_SECRET. Exiting...');
      process.exit(1);
    }
  } else if (jwtSecret === 'mulligan-secret-key-change-in-production') {
    console.error('❌ CRITICAL: Using default JWT_SECRET! This is insecure!');
    console.error('   Set a strong JWT_SECRET in your .env file');
    console.error('   Generate one with: openssl rand -base64 32');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  } else {
    console.log('✅ JWT_SECRET validated');
  }
}

