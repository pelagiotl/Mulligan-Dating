import { Router } from 'express';
import { z } from 'zod';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationCode, formatPhoneNumber, isValidPhoneNumber, isTwilioVerifyConfigured, sendVerificationCodeViaVerify, verifyCodeViaVerify } from '../services/sms.js';
import { sendVerificationCodeSNS, formatPhoneNumber as formatPhoneNumberSNS, isValidPhoneNumber as isValidPhoneNumberSNS, isSNSConfigured } from '../services/aws-sns.js';
import { rateLimitAuth } from '../middleware/security.js';

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
  acceptTerms: z.boolean().optional(), // For signup flow
  acceptPrivacy: z.boolean().optional() // For signup flow
});

function digitsOnly(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function splitConfiguredPhones(value: string | null | undefined): Set<string> {
  return new Set(
    String(value || '')
      .split(',')
      .map((p) => digitsOnly(p))
      .filter(Boolean)
  );
}

function isTestPhoneBypassEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.TEST_PHONE_LOGIN_ENABLED || '').toLowerCase());
}

function isTestPhoneNumber(formattedPhone: string): boolean {
  if (!isTestPhoneBypassEnabled()) return false;
  return splitConfiguredPhones(process.env.TEST_PHONE_NUMBERS).has(digitsOnly(formattedPhone));
}

function testPhoneCode(): string {
  return process.env.TEST_PHONE_CODE || '123456';
}

async function completePhoneLogin(
  formattedPhone: string,
  acceptTerms?: boolean,
  acceptPrivacy?: boolean
): Promise<{
  message: string;
  token: string;
  userId: string;
  hasProfile: boolean;
  isNewUser: boolean;
}> {
  const existingUserStmt = db.prepare('SELECT id, phone_verified FROM users WHERE phone_number = ?');
  const existingUserResult = existingUserStmt.get(formattedPhone);
  const existingUser = (existingUserResult instanceof Promise
    ? await existingUserResult
    : existingUserResult) as { id: string; phone_verified: number } | null;

  let userId: string;
  let isNewUser = false;
  if (existingUser) {
    userId = existingUser.id;
    const updateStmt = db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?');
    const updateResult = updateStmt.run([userId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    if (acceptTerms !== true || acceptPrivacy !== true) {
      throw new Error('TERMS_REQUIRED');
    }
    userId = uuidv4();
    isNewUser = true;
    const now = new Date().toISOString();
    const insertUserStmt = db.prepare(
      'INSERT INTO users (id, email, phone_number, phone_verified, tos_accepted_at, privacy_accepted_at, password) VALUES (?, ?, ?, 1, ?, ?, ?)'
    );
    const insertResult = insertUserStmt.run([userId, null, formattedPhone, now, now, '']);
    if (insertResult instanceof Promise) await insertResult;
    const { grantInitialTokens } = await import('./tokens.js');
    await grantInitialTokens(userId);
  }

  const { generateToken } = await import('../middleware/auth.js');
  const token = generateToken(userId);
  const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
  const profileResult = profileStmt.get(userId);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as { id: string } | null;

  return {
    message: existingUser ? 'Login successful' : 'Account created successfully',
    token,
    userId,
    hasProfile: !!profile,
    isNewUser,
  };
}

/**
 * Send verification code to phone number
 * POST /api/sms/send-code
 */
smsRouter.post('/send-code', rateLimitAuth, async (req, res) => {
  try {
    console.log('📥 POST /api/sms/send-code - Request received');
    console.log('   Origin:', req.headers.origin || 'no origin');
    console.log('   User-Agent:', req.headers['user-agent'] || 'no user-agent');
    console.log('   Body:', { phoneNumber: req.body?.phoneNumber || 'missing' });
    
    const { phoneNumber } = sendCodeSchema.parse(req.body);
    
    // Check which service to use (priority: Twilio Verify > AWS SNS > Twilio Messages)
    const useVerify = isTwilioVerifyConfigured();
    const useSNS = !useVerify && isSNSConfigured();
    
    console.log('📡 SMS Service Check:', {
      useVerify,
      useSNS,
      hasAWSKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasAWSSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'not set',
      hasVerifyServiceSid: !!process.env.TWILIO_VERIFY_SERVICE_SID
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

    if (isTestPhoneNumber(formattedPhone)) {
      verificationCodes.set(formattedPhone, {
        code: testPhoneCode(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        userId: existingUser?.id,
      });
      console.log('🧪 Test phone login bypass: skipping SMS send for whitelisted number');
      return res.json({
        message: 'Test verification code ready',
        phoneNumber: formattedPhone,
        smsSent: true,
        testBypass: true,
        code:
          process.env.NODE_ENV !== 'production' ||
          ['1', 'true', 'yes', 'on'].includes(String(process.env.TEST_PHONE_LOGIN_SHOW_CODE || '').toLowerCase())
            ? testPhoneCode()
            : undefined,
      });
    }

    // Reviewer/QA bypass: don't send real SMS to the designated test number (e.g. 555); verify-code will accept fixed code
    const reviewerPhone = process.env.REVIEWER_PHONE?.replace(/\D/g, '') || '';
    const inputDigits = (formattedPhone || '').replace(/\D/g, '');
    if (reviewerPhone && inputDigits === reviewerPhone) {
      if (existingUser?.id) {
        verificationCodes.set(formattedPhone, {
          code: '',
          expiresAt: Date.now() + 10 * 60 * 1000,
          userId: existingUser.id
        });
      }
      return res.json({
        message: 'Verification code sent',
        phoneNumber: formattedPhone,
        smsSent: true,
        code: process.env.NODE_ENV !== 'production' ? (process.env.REVIEWER_CODE || '123456') : undefined
      });
    }

    // If using Twilio Verify, use it (no code generation needed)
    if (useVerify) {
      const result = await sendVerificationCodeViaVerify(formattedPhone);
      if (result.success) {
        // Store userId for login flow (Verify handles code storage)
        if (existingUser?.id) {
          verificationCodes.set(formattedPhone, {
            code: '', // Not needed with Verify
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
            userId: existingUser.id
          });
        }
        return res.json({
          message: 'Verification code sent via SMS',
          phoneNumber: formattedPhone,
          smsSent: true,
          usingVerify: true
        });
      } else {
        return res.status(500).json({ 
          error: 'Failed to send verification code. Please try again.' 
        });
      }
    }

    // Fallback to manual code generation (AWS SNS or Twilio Messages)
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

    // Log code for debugging (always)
    console.log(`🔐 Verification code for ${formattedPhone}: ${code}`);
    
    // Return response immediately (don't wait for SMS to send)
    // This makes the login flow feel instant
    const response = {
      message: 'Verification code sent',
      phoneNumber: formattedPhone,
      smsSent: true, // Optimistically assume it will send
      code: process.env.NODE_ENV !== 'production' ? code : undefined // Only return code in dev
    };
    
    // Send SMS in background (non-blocking)
    // This allows the user to see the code input screen immediately
    (async () => {
      try {
        const sent = useSNS
          ? await sendVerificationCodeSNS(formattedPhone, code)
          : await sendVerificationCode(formattedPhone, code);
        
        if (!sent) {
          console.warn(`⚠️ SMS failed for ${formattedPhone}, but code is still valid`);
        } else {
          console.log(`✅ SMS sent successfully to ${formattedPhone}`);
        }
      } catch (smsError) {
        console.error('❌ Error sending SMS (non-critical):', smsError);
        // Don't fail the request - code is still valid and user can proceed
      }
    })();
    
    // Return immediately - don't wait for SMS
    res.json(response);
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
    const { phoneNumber, code, acceptTerms, acceptPrivacy } = verifyCodeSchema.parse(req.body);
    
    // Check which service to use (priority: Twilio Verify > AWS SNS > Twilio Messages)
    const useVerify = isTwilioVerifyConfigured();
    const useSNS = !useVerify && isSNSConfigured();
    
    console.log('📡 SMS Service Check (verify):', {
      useVerify,
      useSNS,
      hasAWSKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasAWSSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'not set',
      hasVerifyServiceSid: !!process.env.TWILIO_VERIFY_SERVICE_SID
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

    if (isTestPhoneNumber(formattedPhone)) {
      if (code !== testPhoneCode()) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }
      try {
        const result = await completePhoneLogin(formattedPhone, acceptTerms, acceptPrivacy);
        verificationCodes.delete(formattedPhone);
        return res.json({ ...result, testBypass: true });
      } catch (err) {
        if (err instanceof Error && err.message === 'TERMS_REQUIRED') {
          return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
        }
        throw err;
      }
    }

    // Reviewer / QA bypass: allow a fixed code for a designated phone (for Google Play / App Store reviewers)
    const reviewerPhone = process.env.REVIEWER_PHONE?.replace(/\D/g, '') || '';
    const reviewerCode = process.env.REVIEWER_CODE || '123456';
    const inputDigits = formattedPhone.replace(/\D/g, '');
    if (reviewerPhone && inputDigits === reviewerPhone && code === reviewerCode) {
      const existingUserStmt = db.prepare('SELECT id, phone_verified FROM users WHERE phone_number = ?');
      const existingUser = await (existingUserStmt.get(formattedPhone) as Promise<{ id: string; phone_verified: number } | null>);
      let userId: string;
      let isNewUser = false;
      if (existingUser) {
        userId = existingUser.id;
        const updateStmt = db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?');
        await (updateStmt.run([userId]) as Promise<any>);
      } else {
        if (acceptTerms !== true || acceptPrivacy !== true) {
          return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
        }
        userId = uuidv4();
        isNewUser = true;
        const now = new Date().toISOString();
        const insertUserStmt = db.prepare(
          'INSERT INTO users (id, email, phone_number, phone_verified, tos_accepted_at, privacy_accepted_at, password) VALUES (?, ?, ?, 1, ?, ?, ?)'
        );
        await (insertUserStmt.run([userId, null, formattedPhone, now, now, '']) as Promise<any>);
        const { grantInitialTokens } = await import('./tokens.js');
        await grantInitialTokens(userId);
      }
      const { generateToken } = await import('../middleware/auth.js');
      const token = generateToken(userId);
      const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
      const profile = await (profileStmt.get(userId) as Promise<{ id: string } | null>);
      const hasProfile = !!profile;
      return res.json({
        message: existingUser ? 'Login successful' : 'Account created successfully',
        token,
        userId,
        hasProfile,
        isNewUser
      });
    }

    // If using Twilio Verify, verify code via Verify API
    if (useVerify) {
      console.log(`🔍 Verifying code for ${formattedPhone} using Twilio Verify...`);
      console.log(`   Code received: ${code}`);
      console.log(`   Code length: ${code.length}`);
      
      const isValidCode = await verifyCodeViaVerify(formattedPhone, code);
      console.log(`📊 Verification result: ${isValidCode ? 'valid' : 'invalid'}`);
      
      if (!isValidCode) {
        console.error(`❌ Verification failed for ${formattedPhone} with code: ${code}`);
        return res.status(400).json({ 
          error: 'Invalid verification code. Please check the code and try again.',
          details: 'The code may have expired or was entered incorrectly.'
        });
      }
      
      // Code is valid - check if user exists
      const existingUserStmt = db.prepare('SELECT id, phone_verified FROM users WHERE phone_number = ?');
      const existingUser = await (existingUserStmt.get(formattedPhone) as Promise<{ id: string; phone_verified: number } | null>);
      
      let userId: string;
      let isNewUser = false;

      if (existingUser) {
        // Login: user exists with this phone number
        userId = existingUser.id;
        isNewUser = false;
        
        // Update phone_verified if not already verified
        const updateStmt = db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?');
        await (updateStmt.run([userId]) as Promise<any>);
        
        console.log('✅ User logged in via phone (Verify):', {
          userId,
          phoneNumber: formattedPhone
        });
      } else {
        // Signup: create new user with phone number only
        if (acceptTerms !== true || acceptPrivacy !== true) {
          return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
        }
        
        userId = uuidv4();
        isNewUser = true;
        const now = new Date().toISOString();
        
        const insertUserStmt = db.prepare(
          'INSERT INTO users (id, email, phone_number, phone_verified, tos_accepted_at, privacy_accepted_at, password) VALUES (?, ?, ?, 1, ?, ?, ?)'
        );
        // Use null for email since this is phone-only authentication
        await (insertUserStmt.run([userId, null, formattedPhone, now, now, '']) as Promise<any>);
        
        console.log('✅ New user created via phone (Verify):', {
          userId,
          phoneNumber: formattedPhone
        });
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
        isNewUser
      });
      return; // Exit early for Verify path
    }

    // Fallback to manual code verification (AWS SNS or Twilio Messages)
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
        'INSERT INTO users (id, email, phone_number, phone_verified, tos_accepted_at, privacy_accepted_at, password) VALUES (?, ?, ?, 1, ?, ?, ?)'
      );
      // Use null for email since this is phone-only authentication
      await (insertUserStmt.run([userId, null, formattedPhone, now, now, '']) as Promise<any>); // Empty password since we use SMS auth
      
      console.log('✅ New user created via phone:', {
        userId,
        phoneNumber: formattedPhone
      });

      // Grant initial 7 tokens to new user
      const { grantInitialTokens } = await import('./tokens.js');
      await grantInitialTokens(userId);
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
      isNewUser
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

