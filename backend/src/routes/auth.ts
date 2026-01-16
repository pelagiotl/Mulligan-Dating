import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { getUserByReferralCode, getOrCreateReferralCode, grantReferralToken } from '../utils/referrals.js';
import { sanitizeText, rateLimitAuth, rateLimitSignup } from '../middleware/security.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .refine(
      (pwd) => /[A-Z]/.test(pwd) || /[a-z]/.test(pwd),
      'Password must contain at least one letter'
    )
    .refine(
      (pwd) => /[0-9]/.test(pwd),
      'Password must contain at least one number'
    ),
  referralCode: z.string()
    .max(50, 'Referral code must be at most 50 characters')
    .optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the Terms of Service'),
  acceptPrivacy: z.boolean().refine(val => val === true, 'You must accept the Privacy Policy')
});

const loginSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(1, 'Password is required')
    .max(128, 'Password must be at most 128 characters')
});

// Sign up
authRouter.post('/signup', rateLimitSignup, async (req, res) => {
  try {
    const parsed = signupSchema.parse(req.body);
    
    // Sanitize email (already validated by Zod, but extra safety)
    const email = sanitizeText(parsed.email.toLowerCase().trim(), 255);
    const password = parsed.password; // Don't sanitize password (it's hashed)
    const referralCode = parsed.referralCode ? sanitizeText(parsed.referralCode.trim(), 50) : undefined;
    
    // Check if user exists
    const existingUserStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existingUser = await (existingUserStmt.get(email) as Promise<any>);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const now = new Date().toISOString();
    
    const insertStmt = db.prepare('INSERT INTO users (id, email, password, tos_accepted_at, privacy_accepted_at) VALUES (?, ?, ?, ?, ?)');
    await (insertStmt.run([userId, email, hashedPassword, now, now]) as Promise<any>);

    // Generate referral code for the new user
    const newUserReferralCode = await getOrCreateReferralCode(userId);

    // Handle referral if code provided
    let referrerId: string | null = null;
    if (referralCode && referralCode.trim()) {
      referrerId = await getUserByReferralCode(referralCode);
      
      if (referrerId && referrerId !== userId) {
        // Check if this user was already referred (prevent duplicate referrals)
        const existingReferralStmt = db.prepare('SELECT id FROM referrals WHERE referred_id = ?');
        const existingReferral = await (existingReferralStmt.get(userId) as Promise<any>);
        
        if (!existingReferral) {
          // Create referral record
          const referralId = uuidv4();
          const insertReferralStmt = db.prepare(
            `INSERT INTO referrals (id, referrer_id, referred_id, referral_code) 
             VALUES (?, ?, ?, ?)`
          );
          await (insertReferralStmt.run([referralId, referrerId, userId, referralCode]) as Promise<any>);

          // Grant token to referrer
          await grantReferralToken(referrerId);
          
          // Mark referral as having granted token
          const updateReferralStmt = db.prepare(`UPDATE referrals SET token_granted = 1 WHERE id = ?`);
          await (updateReferralStmt.run([referralId]) as Promise<any>);
        }
      }
    }

    const token = generateToken(userId);
    res.status(201).json({ 
      message: 'Account created successfully',
      token,
      userId,
      referralCode: newUserReferralCode,
      referredBy: referrerId || null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
authRouter.post('/login', rateLimitAuth, async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body?.email, hasPassword: !!req.body?.password });
    const parsed = loginSchema.parse(req.body);
    
    // Sanitize email
    const email = sanitizeText(parsed.email.toLowerCase().trim(), 255);
    const password = parsed.password; // Don't sanitize password
    
    const stmt = db.prepare('SELECT id, password, is_restricted FROM users WHERE email = ?');
    const user = await (stmt.get(email) as Promise<{ id: string; password: string; is_restricted: number } | null>);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is restricted
    if (user.is_restricted === 1) {
      return res.status(403).json({ error: 'Your account has been restricted. Please contact support at Mulligandating@gmail.com' });
    }

    // Check if password field exists and is valid
    if (!user.password || typeof user.password !== 'string') {
      console.error('User password field is invalid:', { userId: user.id, email, hasPassword: !!user.password });
      return res.status(500).json({ error: 'Account data error - please contact support' });
    }

    // Compare password with error handling for malformed hashes
    let validPassword = false;
    try {
      validPassword = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      console.error('bcrypt.compare error:', bcryptError);
      console.error('User password hash might be corrupted:', { userId: user.id, email, passwordHashLength: user.password.length });
      return res.status(500).json({ error: 'Password verification failed - please contact support' });
    }
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token with error handling
    let token: string;
    try {
      token = generateToken(user.id);
    } catch (tokenError) {
      console.error('Token generation error:', tokenError);
      return res.status(500).json({ error: 'Failed to generate authentication token' });
    }
    
    // Check if profile exists
    let profile;
    try {
      const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
      profile = await (profileStmt.get(user.id) as Promise<any>);
    } catch (profileError) {
      console.error('Profile query error:', profileError);
      // Don't fail login if profile query fails, just assume no profile
      profile = null;
    }
    
    res.json({ 
      message: 'Login successful',
      token,
      userId: user.id,
      hasProfile: !!profile
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('❌ Login error:', error);
    console.error('❌ Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Request body:', { email: req.body?.email, hasPassword: !!req.body?.password });
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      code: (error as any)?.code,
      errno: (error as any)?.errno
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      error: 'Failed to login',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorMessage : 'Please check server logs'
    });
  }
});

// Get current user
authRouter.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stmt = db.prepare('SELECT id, email, phone_number, is_admin, created_at FROM users WHERE id = ?');
    const user = await (stmt.get(req.userId) as Promise<{ id: string; email: string | null; phone_number: string | null; is_admin: number; created_at: string } | null>);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile = null;
    try {
      const profileStmt = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
      profile = await (profileStmt.get(req.userId) as Promise<any>);
    } catch (profileError) {
      console.error('Profile query error in /auth/me:', profileError);
      // Don't fail the request if profile query fails, just return null
      profile = null;
    }
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phone_number,
        isAdmin: user.is_admin === 1,
        createdAt: user.created_at
      }, 
      profile 
    });
  } catch (error) {
    console.error('Error in /auth/me:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

