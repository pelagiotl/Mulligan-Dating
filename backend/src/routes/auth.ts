import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { getUserByReferralCode, getOrCreateReferralCode, grantReferralToken } from '../utils/referrals.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  referralCode: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Sign up
authRouter.post('/signup', async (req, res) => {
  try {
    const { email, password, referralCode } = signupSchema.parse(req.body);
    
    // Check if user exists
    const existingUserStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existingUser = await (existingUserStmt.get(email) as Promise<any>);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    
    const insertStmt = db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)');
    await (insertStmt.run([userId, email, hashedPassword]) as Promise<any>);

    // Generate referral code for the new user
    const newUserReferralCode = await getOrCreateReferralCode(userId);

    // Handle referral if code provided
    let referrerId: string | null = null;
    if (referralCode) {
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
authRouter.post('/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body?.email, hasPassword: !!req.body?.password });
    const { email, password } = loginSchema.parse(req.body);
    
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
    console.error('Login error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Request body:', { email: req.body?.email, hasPassword: !!req.body?.password });
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      error: 'Failed to login',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
});

// Get current user
authRouter.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stmt = db.prepare('SELECT id, email, is_admin, created_at FROM users WHERE id = ?');
    const user = await (stmt.get(req.userId) as Promise<{ id: string; email: string; is_admin: number; created_at: string } | null>);
    
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

