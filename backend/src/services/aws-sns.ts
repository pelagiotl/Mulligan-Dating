// AWS SNS service for sending SMS
// To use this, you need to:
// 1. Sign up for AWS: https://aws.amazon.com/
// 2. Create an IAM user with SNS permissions
// 3. Get your Access Key ID and Secret Access Key
// 4. Set environment variables:
//    - AWS_ACCESS_KEY_ID
//    - AWS_SECRET_ACCESS_KEY
//    - AWS_REGION (e.g., us-east-1)

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

let snsClient: SNSClient | null = null;

// Try to initialize AWS SNS client
try {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log('🔍 AWS SNS config check:', {
    hasAccessKeyId: !!accessKeyId,
    hasSecretAccessKey: !!secretAccessKey,
    region: region,
    accessKeyIdPrefix: accessKeyId ? accessKeyId.substring(0, 5) : 'none'
  });

  if (accessKeyId && secretAccessKey) {
    snsClient = new SNSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    console.log('✅ AWS SNS service initialized');
  } else {
    console.warn('⚠️  AWS credentials not found. SMS sending will be disabled.');
    console.warn('   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
  }
} catch (error) {
  console.warn('⚠️  AWS SNS package not installed. SMS verification will be disabled.');
  console.warn('   Install with: cd backend && npm install @aws-sdk/client-sns');
  console.error('   Error:', error);
}

/**
 * Send SMS verification code using AWS SNS
 * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
 * @param code - 6-digit verification code
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendVerificationCodeSNS(phoneNumber: string, code: string): Promise<boolean> {
  if (!snsClient) {
    console.error('❌ AWS SNS client not initialized. Cannot send SMS.');
    return false;
  }

  try {
    const command = new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: `Your Mulligan verification code is: ${code}. This code expires in 10 minutes.`,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional', // Use Transactional for verification codes
        },
      },
    });

    const response = await snsClient.send(command);
    console.log(`✅ SMS sent to ${phoneNumber} via AWS SNS. Message ID: ${response.MessageId}`);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to send SMS via AWS SNS:', error.message);
    console.error('❌ Error details:', {
      name: error.name,
      code: error.code,
      message: error.message,
      requestId: error.$metadata?.requestId,
    });

    // Log helpful error messages
    if (error.name === 'InvalidParameter' || error.code === 'InvalidParameter') {
      console.error('⚠️  Invalid phone number format. Make sure it\'s in E.164 format (e.g., +15551234567)');
    } else if (error.name === 'OptedOut' || error.code === 'OptedOut') {
      console.error('⚠️  Phone number has opted out of SMS. User needs to opt back in.');
    } else if (error.name === 'Throttling' || error.code === 'Throttling') {
      console.error('⚠️  Rate limit exceeded. Please wait a moment and try again.');
    } else if (error.message?.includes('sandbox')) {
      console.error('⚠️  AWS SNS is in sandbox mode. You need to verify recipient phone numbers.');
      console.error('   Go to: https://console.aws.amazon.com/sns/v3/home#/mobile/text-messaging');
    }

    return false;
  }
}

/**
 * Check if AWS SNS is configured
 */
export function isSNSConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    snsClient
  );
}

/**
 * Format phone number to E.164 format (same as Twilio version)
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

