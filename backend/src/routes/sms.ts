import { Router } from 'express';
import { z } from 'zod';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationCode, formatPhoneNumber, isValidPhoneNumber } from '../services/sms.js';
import { sendVerificationCodeSNS, formatPhoneNumber as formatPhoneNumberSNS, isValidPhoneNumber as isValidPhoneNumberSNS, isSNSConfigured } from '../services/aws-sns.js';
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
  phoneNumber: z.string().min(10, 'Phone number is required')
});

const verifyCodeSchema = z.object({
  phoneNumber: z.string().min(10, 'Phone number is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
  referralCode: z.string().optional(), // For signup flow
  acceptTerms: z.boolean().optional(), // For signup flow
  acceptPrivacy: z.boolean().optional() // For signup flow
});

/**
 * Send verification code to phone number
 * POST /api/sms/send-code
 */
smsRouter.post('/send-code', rateLimitAuth, async (req, res) => {
  try {
    const { phoneNumber } = sendCodeSchema.parse(req.body);
    
    // Check which service to use (SNS takes priority if configured)
    const useSNS = isSNSConfigured();
    console.log('📡 SMS Service Check:', {
      useSNS,
      hasAWSKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasAWSSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'not set'
    });
    
    // Format and validate phone number
    const formattedPhone = useSNS 
      ? formatPhoneNumberSNS(phoneNumber)
      : formatPhoneNumber(phoneNumber);
    const isValid = useSNS
      ? isValidPhoneNumberSNS(formattedPhone || '')
      : isValidPhoneNumber(formattedPhone || '');
    
    if (!formattedPhone || !isValid) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if phone number is already registered
    const existingUserStmt = db.prepare('SELECT id, phone_verified FROM users WHERE phone_number = ?');
    const existingUser = await (existingUserStmt.get(formattedPhone) as Promise<{ id: string; phone_verified: number } | null>);
    
    // Debug logging
    console.log('📱 Phone lookup:', {
      input: phoneNumber,
      formatted: formattedPhone,
      found: !!existingUser,
      userId: existingUser?.id,
      isLogin: !!existingUser
    });

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with 10-minute expiration
    // If user exists, store their userId for login flow
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    verificationCodes.set(formattedPhone, {
      code,
      expiresAt,
      userId: existingUser?.id // Store userId if user exists (for login)
    });

    // Send SMS (use AWS SNS if configured, otherwise Twilio)
    const sent = useSNS
      ? await sendVerificationCodeSNS(formattedPhone, code)
      : await sendVerificationCode(formattedPhone, code);
    
    // Always return the code for testing (even in production, for now)
    // This helps with debugging and allows users to proceed if SMS fails
    console.log(`🔐 Verification code for ${formattedPhone}: ${code}`);
    
    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        message: sent ? 'Verification code sent via SMS' : 'Code sent (dev mode - SMS failed, check console)',
        code: code, // Always return in dev for testing
        phoneNumber: formattedPhone,
        smsSent: sent
      });
    }
    
    // In production, still return code if SMS failed (for debugging)
    // But log a warning
    if (!sent) {
      console.warn(`⚠️ SMS failed for ${formattedPhone}, but returning code for debugging`);
      return res.json({
        message: 'Verification code generated (SMS may have failed - check backend logs)',
        code: code, // Return code even if SMS failed
        phoneNumber: formattedPhone,
        smsSent: false
      });
    }

    res.json({ 
      message: 'Verification code sent',
      phoneNumber: formattedPhone,
      smsSent: true
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
    const { phoneNumber, code, referralCode, acceptTerms, acceptPrivacy } = verifyCodeSchema.parse(req.body);
    
    // Check which service to use (SNS takes priority if configured)
    const useSNS = isSNSConfigured();
    console.log('📡 SMS Service Check (verify):', {
      useSNS,
      hasAWSKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasAWSSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'not set'
    });
    
    // Format phone number
    const formattedPhone = useSNS 
      ? formatPhoneNumberSNS(phoneNumber)
      : formatPhoneNumber(phoneNumber);
    const isValid = useSNS
      ? isValidPhoneNumberSNS(formattedPhone || '')
      : isValidPhoneNumber(formattedPhone || '');
    
    if (!formattedPhone || !isValid) {
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
      isNewUser = false;
      
      // Update phone_verified if not already verified
      const updateStmt = db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?');
      await (updateStmt.run([userId]) as Promise<any>);
      
      console.log('✅ User logged in via phone:', {
        userId,
        phoneNumber: formattedPhone
      });
    } else {
      // Signup: create new user with phone number only
      // Validate terms acceptance for new signups
      if (acceptTerms !== true || acceptPrivacy !== true) {
        return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
      }
      
      // Check if phone number is already registered (shouldn't happen, but double-check)
      const existingUserCheckStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
      const existingUserCheck = await (existingUserCheckStmt.get(formattedPhone) as Promise<{ id: string } | null>);
      
      if (existingUserCheck) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
      
      // Create new user with phone number only (no email, no password)
      userId = uuidv4();
      isNewUser = true;
      const now = new Date().toISOString();
      
      // Create user with phone number only
      const insertUserStmt = db.prepare(
        'INSERT INTO users (id, phone_number, phone_verified, tos_accepted_at, privacy_accepted_at, password) VALUES (?, ?, 1, ?, ?, ?)'
      );
      await (insertUserStmt.run([userId, formattedPhone, now, now, '']) as Promise<any>); // Empty password since we use SMS auth
      
      console.log('✅ New user created via phone:', {
        userId,
        phoneNumber: formattedPhone
      });

      // Generate referral code for the new user
      const newUserReferralCode = await getOrCreateReferralCode(userId);

      // Handle referral if code provided
      let referrerId: string | null = null;
      if (referralCode && referralCode.trim()) {
        referrerId = await getUserByReferralCode(referralCode.trim());
        
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
            await (insertReferralStmt.run([referralId, referrerId, userId, referralCode.trim()]) as Promise<any>);

            // Grant token to referrer
            await grantReferralToken(referrerId);
            
            // Mark referral as having granted token
            const updateReferralStmt = db.prepare(`UPDATE referrals SET token_granted = 1 WHERE id = ?`);
            await (updateReferralStmt.run([referralId]) as Promise<any>);
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

    const userReferralCode = isNewUser ? await getOrCreateReferralCode(userId) : undefined;
    
    res.json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      userId,
      hasProfile,
      isNewUser,
      referralCode: userReferralCode
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

