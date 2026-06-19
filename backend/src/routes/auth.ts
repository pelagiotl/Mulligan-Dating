import { Router } from 'express';
import { isMatchmakingGloballyDisabled, getMatchmakingDisabledMessage } from '../config/matchmaking.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { generateToken, authenticateToken, AuthRequest, userHasAdminAccess } from '../middleware/auth.js';
import { persistClientPlatformForUser, detectClientPlatformFromRequest } from '../utils/clientPlatform.js';
import { sanitizeText, rateLimitAuth, rateLimitSignup, rateLimitAPI } from '../middleware/security.js';
import { isWebPushConfigured } from '../services/webPushDelivery.js';
import { getConnectSetupViolationsForUser } from '../utils/connectRequirements.js';

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
    
    const { ACCOUNT_STATUS_ONBOARDING } = await import('../utils/accountStatus.js');
    const insertStmt = db.prepare(
      'INSERT INTO users (id, email, password, tos_accepted_at, privacy_accepted_at, account_status) VALUES (?, ?, ?, ?, ?, ?)',
    );
    await (insertStmt.run([userId, email, hashedPassword, now, now, ACCOUNT_STATUS_ONBOARDING]) as Promise<any>);

    await persistClientPlatformForUser(req, userId);

    const token = generateToken(userId);
    res.status(201).json({ 
      message: 'Account created successfully',
      token,
      userId
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

    await persistClientPlatformForUser(req, user.id);
    
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
    const stmt = db.prepare(
      'SELECT id, email, phone_number, is_admin, created_at, push_token, account_status, profile_activated_at FROM users WHERE id = ?',
    );
    const user = await (stmt.get(req.userId) as Promise<{
      id: string;
      email: string | null;
      phone_number: string | null;
      is_admin: number;
      created_at: string;
      push_token: string | null;
      account_status: string | null;
      profile_activated_at: string | null;
    } | null>);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile = null;
    try {
      const profileStmt = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
      profile = await (profileStmt.get(req.userId) as Promise<any>);
    } catch (profileError) {
      console.error('Profile query error in /auth/me:', profileError);
      profile = null;
    }

    const hasPushToken = !!(user.push_token && typeof user.push_token === 'string' && user.push_token.trim().length > 0);

    let webPushSubscriptionCount = 0;
    try {
      const cnt = await (db
        .prepare('SELECT COUNT(*) as c FROM web_push_subscriptions WHERE user_id = ?')
        .get(user.id) as Promise<{ c: number } | undefined>);
      webPushSubscriptionCount = Number(cnt?.c ?? 0);
    } catch {
      webPushSubscriptionCount = 0;
    }

    let photoCount = 0;
    if (profile?.id) {
      try {
        const photoCntRow = await (db
          .prepare('SELECT COUNT(*) as c FROM photos WHERE profile_id = ?')
          .get(profile.id) as Promise<{ c: number } | undefined>);
        photoCount = Number(photoCntRow?.c ?? 0);
      } catch (photoCountErr) {
        console.error('Photo count query error in /auth/me:', photoCountErr);
        photoCount = 0;
      }
    }

    const { getActivationSetupViolationsForUser, getConnectSetupViolationsForUser } = await import(
      '../utils/connectRequirements.js',
    );
    const clientPlatform = detectClientPlatformFromRequest(req);
    const activationMissing = await getActivationSetupViolationsForUser(user.id, {
      clientPlatform,
    });
    const connectSetupMissing = await getConnectSetupViolationsForUser(user.id);
    const { isActiveAccountStatus } = await import('../utils/accountStatus.js');
    const accountActive = isActiveAccountStatus(user.account_status);
    const profileActivated = !!(user.profile_activated_at && String(user.profile_activated_at).trim());
    const connectSetupComplete =
      activationMissing.length === 0 && accountActive && profileActivated;

    const matchmakingOff = isMatchmakingGloballyDisabled();
    const isAdmin = userHasAdminAccess(user.id, user.is_admin, user.phone_number);
    const email =
      user.email != null && String(user.email).trim() ? String(user.email).trim() : null;

    res.json({
      user: {
        id: user.id,
        email,
        phoneNumber: user.phone_number,
        isAdmin,
        createdAt: user.created_at,
        accountStatus: user.account_status ?? 'active',
        accountActive,
        hasPushToken, // so app can show "Push registered" and debug message notifications
        webPushConfigured: isWebPushConfigured(),
        webPushSubscriptionCount,
      },
      profile,
      photoCount,
      connectSetupComplete,
      connectSetupMissing,
      matchmakingEnabled: !matchmakingOff,
      matchmakingDisabledMessage: matchmakingOff ? getMatchmakingDisabledMessage() : null,
    });
  } catch (error) {
    console.error('Error in /auth/me:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.union([z.number(), z.null()]).optional(),
});

// Save Web Push subscription (PWA / Chrome / Safari 16.4+ on home screen)
authRouter.post('/web-push-subscription', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: 'Web Push is not configured (VAPID keys) on this server.' });
    }
    const parsed = webPushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }
    const userId = req.userId!;
    const { endpoint, keys } = parsed.data;
    const id = uuidv4();

    const del = db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint = ?').run([endpoint]);
    if (del instanceof Promise) await del;

    const ins = db
      .prepare('INSERT INTO web_push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)')
      .run([id, userId, endpoint, keys.p256dh, keys.auth]);
    if (ins instanceof Promise) await ins;

    console.log(`📲 Web Push subscription saved for user ${userId} (endpoint …${endpoint.slice(-24)})`);
    res.json({ ok: true });
  } catch (error) {
    console.error('web-push-subscription error:', error);
    res.status(500).json({ error: 'Failed to save Web Push subscription' });
  }
});

// Update push notification token
authRouter.post('/push-token', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.userId!;
    console.log(`📲 POST /auth/push-token: user=${userId} hasToken=${!!pushToken} type=${typeof pushToken} len=${typeof pushToken === 'string' ? pushToken.length : 0}`);

    // Validate push token format (Expo push tokens start with "ExponentPushToken[")
    if (pushToken && typeof pushToken === 'string' && pushToken.length > 0) {
      // Update user's push token and reset fail count so message pushes work again
      const updateStmt = db.prepare('UPDATE users SET push_token = ?, push_token_fail_count = 0 WHERE id = ?');
      await (updateStmt.run([pushToken, userId]) as Promise<any>);
      
      console.log(`✅ Push token saved for user ${userId} (prefix: ${pushToken.substring(0, 28)}...)`);
      res.json({ message: 'Push token updated successfully' });
    } else if (pushToken === null || pushToken === '') {
      // Remove push token if explicitly cleared
      const updateStmt = db.prepare('UPDATE users SET push_token = NULL WHERE id = ?');
      await (updateStmt.run([userId]) as Promise<any>);
      
      console.log(`✅ Push token cleared for user ${userId}`);
      res.json({ message: 'Push token cleared successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid push token format' });
    }
  } catch (error) {
    console.error('Error updating push token:', error);
    res.status(500).json({ 
      error: 'Failed to update push token',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

