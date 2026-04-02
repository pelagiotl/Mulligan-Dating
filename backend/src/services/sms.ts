// SMS service using Twilio
// To use this, you need to:
// 1. Sign up for Twilio: https://www.twilio.com/try-twilio
// 2. Get your Account SID and Auth Token from the Twilio Console
// 3. Get a phone number from Twilio (free trial numbers available) OR use Twilio Verify
// 4. Set environment variables:
//    - TWILIO_ACCOUNT_SID
//    - TWILIO_AUTH_TOKEN
//    - TWILIO_PHONE_NUMBER (for regular SMS) OR TWILIO_VERIFY_SERVICE_SID (for Verify - recommended)

let twilioClient: any = null;
let useTwilioVerify = false;

// Try to import Twilio (optional dependency)
try {
  const twilio = require('twilio');
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  
  console.log('🔍 Twilio config check:', {
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    hasPhoneNumber: !!phoneNumber,
    hasVerifyServiceSid: !!verifyServiceSid,
    accountSidPrefix: accountSid ? accountSid.substring(0, 5) : 'none',
    phoneNumber: phoneNumber || 'none',
    verifyServiceSidPrefix: verifyServiceSid ? verifyServiceSid.substring(0, 5) : 'none'
  });
  
  if (accountSid && authToken) {
    twilioClient = twilio(accountSid, authToken);
    
    // Check if using Twilio Verify (recommended - no 10DLC needed)
    if (verifyServiceSid) {
      useTwilioVerify = true;
      console.log('✅ Twilio Verify service initialized (no 10DLC registration needed!)');
      console.log(`   Service SID: ${verifyServiceSid}`);
    } else if (phoneNumber) {
      console.log('✅ Twilio SMS service initialized (using Messages API)');
      console.warn('⚠️  Consider using Twilio Verify instead - no 10DLC registration needed!');
      console.warn('   Set TWILIO_VERIFY_SERVICE_SID instead of TWILIO_PHONE_NUMBER');
    } else {
      console.warn('⚠️  Neither TWILIO_PHONE_NUMBER nor TWILIO_VERIFY_SERVICE_SID set.');
      console.warn('   Set TWILIO_VERIFY_SERVICE_SID (recommended) or TWILIO_PHONE_NUMBER');
    }
  } else {
    console.warn('⚠️  Twilio credentials not found. SMS verification will be disabled.');
    console.warn('   Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file');
  }
} catch (error) {
  console.warn('⚠️  Twilio package not installed. SMS verification will be disabled.');
  console.warn('   Install with: cd backend && npm install twilio');
  console.error('   Error:', error);
}

/**
 * Check if Twilio Verify is configured
 */
export function isTwilioVerifyConfigured(): boolean {
  return useTwilioVerify && !!process.env.TWILIO_VERIFY_SERVICE_SID && !!twilioClient;
}

/**
 * Send verification code using Twilio Verify (recommended - no 10DLC needed)
 * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
 * @returns Promise<{ success: boolean; sid?: string }> - success status and verification SID
 */
export async function sendVerificationCodeViaVerify(phoneNumber: string): Promise<{ success: boolean; sid?: string }> {
  if (!twilioClient || !useTwilioVerify) {
    console.error('❌ Twilio Verify not configured. Cannot send verification.');
    return { success: false };
  }

  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!verifyServiceSid) {
    console.error('❌ TWILIO_VERIFY_SERVICE_SID not set in environment variables');
    return { success: false };
  }

  try {
    const verification = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verifications
      .create({ to: phoneNumber, channel: 'sms' });

    console.log(`✅ Verification sent via Twilio Verify to ${phoneNumber}. SID: ${verification.sid}`);
    console.log(`📊 Verification status: ${verification.status}`);
    console.log(`📊 Verification channel: ${verification.channel}`);
    
    // Log helpful info for troubleshooting
    if (verification.status === 'pending') {
      console.log('ℹ️  Verification is pending. Check Twilio console for delivery status.');
      console.log(`   View in console: https://console.twilio.com/us1/develop/verify/services/${verifyServiceSid}/verifications/${verification.sid}`);
    }
    
    return { success: true, sid: verification.sid };
  } catch (error: any) {
    console.error('❌ Failed to send verification via Twilio Verify:', error.message);
    console.error('❌ Error details:', {
      code: error.code,
      status: error.status,
      message: error.message,
      moreInfo: error.moreInfo
    });
    
    // Log helpful error messages
    if (error.code === 60200) {
      console.error('⚠️  Invalid phone number format. Make sure it\'s in E.164 format (e.g., +15551234567)');
    } else if (error.code === 60203) {
      console.error('⚠️  Max attempts reached. Please wait before requesting another code.');
    } else if (error.code === 60212) {
      console.error('⚠️  Too many attempts. Please wait before requesting another code.');
    } else if (error.message?.includes('trial') || error.message?.includes('unverified')) {
      console.error('⚠️  Twilio trial account restriction. Verify your phone number in Twilio Console:');
      console.error(`   https://console.twilio.com/us1/develop/phone-numbers/manage/verified`);
      console.error(`   Add this number: ${phoneNumber}`);
    }
    
    return { success: false };
  }
}

/**
 * Verify code using Twilio Verify
 * @param phoneNumber - Phone number in E.164 format
 * @param code - Code entered by user
 * @returns Promise<boolean> - true if code is valid
 */
export async function verifyCodeViaVerify(phoneNumber: string, code: string): Promise<boolean> {
  if (!twilioClient || !useTwilioVerify) {
    console.error('❌ Twilio Verify not configured. Cannot verify code.');
    return false;
  }

  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!verifyServiceSid) {
    console.error('❌ TWILIO_VERIFY_SERVICE_SID not set in environment variables');
    return false;
  }

  try {
    console.log(`🔍 Verifying code via Twilio Verify for ${phoneNumber}...`);
    console.log(`   Code provided: ${code}`);
    console.log(`   Service SID: ${verifyServiceSid}`);
    
    const verificationCheck = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks
      .create({ to: phoneNumber, code: code });

    console.log(`📊 Verification check result:`, {
      status: verificationCheck.status,
      valid: verificationCheck.status === 'approved',
      sid: verificationCheck.sid,
      to: verificationCheck.to
    });

    if (verificationCheck.status === 'approved') {
      console.log(`✅ Code verified successfully for ${phoneNumber}`);
      return true;
    } else {
      console.log(`❌ Code verification failed for ${phoneNumber}. Status: ${verificationCheck.status}`);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Failed to verify code via Twilio Verify:', error.message);
    console.error('❌ Error details:', {
      code: error.code,
      status: error.status,
      message: error.message,
      moreInfo: error.moreInfo
    });
    
    // Log helpful error messages
    if (error.code === 60202) {
      console.error('⚠️  Invalid verification code. Please check and try again.');
    } else if (error.code === 60203) {
      console.error('⚠️  Max attempts reached. Please request a new code.');
    } else if (error.code === 20429) {
      console.error('⚠️  Too many requests. Please wait a moment and try again.');
    }
    
    return false;
  }
}

/**
 * Send SMS verification code to a phone number (using Messages API - requires phone number)
 * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
 * @param code - 6-digit verification code
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
  if (!twilioClient) {
    console.error('❌ Twilio client not initialized. Cannot send SMS.');
    return false;
  }

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioPhoneNumber) {
    console.error('❌ TWILIO_PHONE_NUMBER not set in environment variables');
    return false;
  }

  try {
    const message = await twilioClient.messages.create({
      body: `Your Mulligan verification code is: ${code}. This code expires in 10 minutes.`,
      from: twilioPhoneNumber,
      to: phoneNumber
    });

    console.log(`✅ SMS sent to ${phoneNumber}. Message SID: ${message.sid}`);
    console.log(`📊 Message status: ${message.status}`);
    console.log(`📊 Message details:`, {
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      direction: message.direction,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      price: message.price,
      priceUnit: message.priceUnit
    });
    
    // Check for delivery issues
    if (message.status === 'queued' || message.status === 'sending') {
      console.log(`ℹ️  Message is ${message.status}. Check Twilio console for delivery status.`);
      console.log(`   View message: https://console.twilio.com/us1/monitor/logs/sms/${message.sid}`);
    }
    
    // Check for error codes that might indicate delivery issues
    if (message.errorCode || message.errorMessage) {
      console.error(`❌ Twilio returned error: Code ${message.errorCode}, Message: ${message.errorMessage}`);
      // If there's an error code, the message didn't actually send successfully
      return false;
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Failed to send SMS:', error.message);
    console.error('❌ Error details:', {
      code: error.code,
      status: error.status,
      message: error.message,
      moreInfo: error.moreInfo
    });
    
    // Log helpful error messages
    if (error.code === 21211) {
      console.error('⚠️  Invalid phone number format. Make sure it\'s in E.164 format (e.g., +15551234567)');
    } else if (error.code === 21608) {
      console.error('⚠️  Unverified recipient phone number. For Twilio trial accounts, you must verify the RECIPIENT phone number (the number you\'re sending TO), not just the sending number.');
      console.error(`   Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified`);
      console.error(`   Add this number: ${phoneNumber}`);
    } else if (error.code === 21610) {
      console.error('⚠️  Unverified caller ID. Verify your sending phone number in Twilio Console.');
    } else if (error.code === 21408) {
      console.error('⚠️  Permission denied. Your Twilio account may still be in trial mode.');
      console.error('   Upgrade your account or verify the recipient phone number.');
    }
    
    return false;
  }
}

/**
 * Format phone number to E.164 format
 * @param phoneNumber - Phone number in any format
 * @returns Formatted phone number or null if invalid
 */
export function formatPhoneNumber(phoneNumber: string): string | null {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // US/Canada numbers: 10 digits, add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // Already has country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // International format already (starts with +)
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // Try to add + if it looks like an international number
  if (digits.length > 10) {
    return `+${digits}`;
  }
  
  return null;
}

/**
 * Validate phone number format
 * @param phoneNumber - Phone number to validate
 * @returns true if valid
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  const formatted = formatPhoneNumber(phoneNumber);
  if (!formatted) return false;
  
  // E.164 format: + followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(formatted);
}

/**
 * Send SMS notification for a new match
 * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
 * @param matchName - Name of the person they matched with
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendMatchNotification(phoneNumber: string, matchName: string): Promise<boolean> {
  if (!twilioClient) {
    console.warn('⚠️  Twilio client not initialized. Skipping SMS notification.');
    return false;
  }

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioPhoneNumber) {
    console.warn('⚠️  TWILIO_PHONE_NUMBER not set. Skipping SMS notification.');
    return false;
  }

  // Format phone number to E.164 if needed
  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    console.error('❌ Invalid phone number format:', phoneNumber);
    return false;
  }

  try {
    const message = await twilioClient.messages.create({
      body: `🎉 ${matchName} connected with you on Mulligan! Open the app to say hi.`,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    console.log(`✅ Match notification SMS sent to ${formattedPhone}. Message SID: ${message.sid}`);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to send match notification SMS:', error.message);
    console.error('❌ Error details:', {
      code: error.code,
      status: error.status,
      message: error.message,
      moreInfo: error.moreInfo
    });
    
    // Log helpful error messages
    if (error.code === 21211) {
      console.error('⚠️  Invalid phone number format. Make sure it\'s in E.164 format (e.g., +15551234567)');
    } else if (error.code === 21608) {
      console.error('⚠️  Unverified phone number. For Twilio trial accounts, you must verify recipient numbers first.');
      console.error('   Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
    } else if (error.code === 21610) {
      console.error('⚠️  Unverified caller ID. Verify your phone number in Twilio Console.');
    }
    
    return false;
  }
}

