import { Router } from 'express';
import { z } from 'zod';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationCode, formatPhoneNumber, isValidPhoneNumber } from '../services/sms.js';
import { rateLimitAuth } from '../middleware/security.js';
import { getUserByReferralCode, getOrCreateReferralCode, grantReferralToken } from '../utils/referrals.js';

export const smsRouter = Router();

// Store verification codes in memory (in production, use Redis or database)
// Format: { phoneNumber: { code: string, expiresAt: number, userId?: string } }
const verificationCodes = new Map<string, { code: string; expiresAt: number; userId?: string }>();

// Clean up expired codes every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(phone);
    }
  }
}, 10 * 60 * 1000);

const sendCodeSchema = z.object({
  phoneNumber: z.string().min(10, 'Phone number is required'),
  email: z.string().email().optional() // For signup flow
});

const verifyCodeSchema = z.object({
  phoneNumber: z.string().min(10, 'Phone number is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
  email: z.string().email().optional(), // For signup flow
  referralCode: z.string().optional() // For signup flow
});

/**
 * Send verification code to phone number
 * POST /api/sms/send-code
 */
smsRouter.post('/send-code', rateLimitAuth, async (req, res) => {
  try {
    const { phoneNumber, email } = sendCodeSchema.parse(req.body);
    
    // Format and validate phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone || !isValidPhoneNumber(formattedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if phone number is already registered (for login)
    const existingUserStmt = db.prepare('SELECT id, phone_verified FROM users WHERE phone_number = ?');
    const existingUser = await (existingUserStmt.get(formattedPhone) as Promise<{ id: string; phone_verified: number } | null>);
    
    // Debug logging
    console.log('📱 Phone lookup:', {
      input: phoneNumber,
      formatted: formattedPhone,
      found: !!existingUser,
      userId: existingUser?.id
    });
    
    // For signup: check if email is provided and if user already exists
    if (email) {
      const emailUserStmt = db.prepare('SELECT id, phone_number FROM users WHERE email = ?');
      const emailUser = await (emailUserStmt.get(email) as Promise<{ id: string; phone_number: string | null } | null>);
      
      if (emailUser) {
        // Email exists - allow linking phone number to existing account
        // Check if phone is already linked to a different account
        if (existingUser && existingUser.id !== emailUser.id) {
          return res.status(400).json({ error: 'Phone number already registered to another account' });
        }
        // If phone is already linked to this account, that's fine - allow resending code
      } else {
        // New email - normal signup flow
        // Check if phone is already registered
        if (existingUser) {
          return res.status(400).json({ error: 'Phone number already registered' });
        }
      }
    } else {
      // For login: user must exist
      if (!existingUser) {
        return res.status(404).json({ error: 'Phone number not found' });
      }
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with 10-minute expiration
    // If email provided, check if it's for linking to existing account
    let userIdForCode: string | undefined = existingUser?.id;
    if (email) {
      const emailUserForCodeStmt = db.prepare('SELECT id FROM users WHERE email = ?');
      const emailUserForCode = await (emailUserForCodeStmt.get(email) as Promise<{ id: string } | null>);
      if (emailUserForCode) {
        userIdForCode = emailUserForCode.id; // Store userId for linking
      }
    }
    
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    verificationCodes.set(formattedPhone, {
      code,
      expiresAt,
      userId: userIdForCode
    });

    // Send SMS
    const sent = await sendVerificationCode(formattedPhone, code);
    
    // In development, always return the code for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 [DEV] Verification code for ${formattedPhone}: ${code}`);
      return res.json({
        message: sent ? 'Verification code sent via SMS' : 'Code sent (dev mode - SMS failed, check console)',
        code: code, // Always return in dev for testing
        phoneNumber: formattedPhone,
        smsSent: sent
      });
    }
    
    if (!sent) {
      return res.status(500).json({ 
        error: 'Failed to send verification code. Please check your Twilio configuration or verify your phone number in Twilio Console.' 
      });
    }

    res.json({ 
      message: 'Verification code sent',
      phoneNumber: formattedPhone // Return formatted number
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Send code error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * Verify code and login/signup
 * POST /api/sms/verify-code
 */
smsRouter.post('/verify-code', rateLimitAuth, async (req, res) => {
  try {
    const { phoneNumber, code, email } = verifyCodeSchema.parse(req.body);
    
    // Format phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone || !isValidPhoneNumber(formattedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Get stored code
    const stored = verificationCodes.get(formattedPhone);
    if (!stored) {
      return res.status(400).json({ error: 'No verification code found. Please request a new code.' });
    }

    // Check expiration
    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(formattedPhone);
      return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
    }

    // Verify code
    if (stored.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Code is valid - proceed with login or signup
    let userId: string;
    let isNewUser = false;

    if (stored.userId) {
      // Login: user exists with this phone number
      userId = stored.userId;
      
      // Update phone_verified if not already verified
      const updateStmt = db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?');
      await (updateStmt.run([userId]) as Promise<any>);
    } else {
      // Signup or linking phone to existing account
      if (!email) {
        return res.status(400).json({ error: 'Email is required for signup' });
      }

      // Check if email already exists (for linking phone to existing account)
      const emailUserStmt = db.prepare('SELECT id, phone_number FROM users WHERE email = ?');
      const emailUser = await (emailUserStmt.get(email) as Promise<{ id: string; phone_number: string | null } | null>);
      
      if (emailUser) {
        // Linking phone to existing account
        userId = emailUser.id;
        isNewUser = false;
        
        // Update existing user with phone number
        const updatePhoneStmt = db.prepare('UPDATE users SET phone_number = ?, phone_verified = 1 WHERE id = ?');
        await (updatePhoneStmt.run([formattedPhone, userId]) as Promise<any>);
        
        console.log('✅ Phone number linked to existing account:', {
          userId,
          email,
          phoneNumber: formattedPhone
        });
      } else {
        // New signup: create new user
        userId = uuidv4();
        isNewUser = true;
        
        // Create user with phone and email (no password needed)
        const insertUserStmt = db.prepare('INSERT INTO users (id, email, phone_number, phone_verified, password) VALUES (?, ?, ?, 1, ?)');
        await (insertUserStmt.run([userId, email, formattedPhone, '']) as Promise<any>); // Empty password since we use SMS auth
        
        console.log('✅ New user created:', {
          userId,
          email,
          phoneNumber: formattedPhone
        });

      // Generate referral code for the new user
      const newUserReferralCode = await getOrCreateReferralCode(userId);

      // Handle referral if code provided
      let referrerId: string | null = null;
      if (req.body.referralCode) {
        referrerId = await getUserByReferralCode(req.body.referralCode);
        
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
            await (insertReferralStmt.run([referralId, referrerId, userId, req.body.referralCode]) as Promise<any>);

            // Grant token to referrer
            await grantReferralToken(referrerId);
            
            // Mark referral as having granted token
            const updateReferralStmt = db.prepare(`UPDATE referrals SET token_granted = 1 WHERE id = ?`);
            await (updateReferralStmt.run([referralId]) as Promise<any>);
          }
        }
      }
      }
    }

    // Clean up verification code
    verificationCodes.delete(formattedPhone);

    // Generate JWT token
    const { generateToken } = await import('../middleware/auth.js');
    const token = generateToken(userId);

    // Check if profile exists
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get(userId) as Promise<{ id: string } | null>);
    const hasProfile = !!profile;

    res.json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      userId,
      hasProfile,
      isNewUser,
      referralCode: isNewUser ? await getOrCreateReferralCode(userId) : undefined
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

