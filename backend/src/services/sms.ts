// SMS service using Twilio
// To use this, you need to:
// 1. Sign up for Twilio: https://www.twilio.com/try-twilio
// 2. Get your Account SID and Auth Token from the Twilio Console
// 3. Get a phone number from Twilio (free trial numbers available)
// 4. Set environment variables:
//    - TWILIO_ACCOUNT_SID
//    - TWILIO_AUTH_TOKEN
//    - TWILIO_PHONE_NUMBER

let twilioClient: any = null;

// Try to import Twilio (optional dependency)
try {
  const twilio = require('twilio');
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  console.log('🔍 Twilio config check:', {
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    hasPhoneNumber: !!phoneNumber,
    accountSidPrefix: accountSid ? accountSid.substring(0, 5) : 'none',
    phoneNumber: phoneNumber || 'none'
  });
  
  if (accountSid && authToken) {
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio SMS service initialized');
    if (!phoneNumber) {
      console.warn('⚠️  TWILIO_PHONE_NUMBER not set. SMS sending will fail.');
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
 * Send SMS verification code to a phone number
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
    
    // Check if message was queued (might indicate trial account restrictions)
    if (message.status === 'queued' || message.status === 'sending') {
      console.log(`ℹ️  Message is ${message.status}. Check Twilio console for delivery status.`);
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
      body: `🎉 You have a new match on Mulligan! ${matchName} matched with you. Open the app to start chatting!`,
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

