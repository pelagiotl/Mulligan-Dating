// Expo Push Notification service
// To use this, you need an Expo account (free) and push notification certificates

import { Expo, ExpoPushMessage } from 'expo-server-sdk';

let expo: Expo | null = null;

// Initialize Expo client (optional dependency)
try {
  expo = new Expo();
  console.log('✅ Expo Push Notification service initialized');
} catch (error) {
  console.warn('⚠️  Expo Push Notification SDK not installed. Push notifications will be disabled.');
  console.warn('   Install with: cd backend && npm install expo-server-sdk');
}

/**
 * Check if Expo Push Notification service is available
 */
export function isPushNotificationConfigured(): boolean {
  return expo !== null;
}

/**
 * Validate if a token is a valid Expo push token
 * Expo push tokens look like: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 */
export function isExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

/**
 * Send push notification to a single user
 * @param pushToken - Expo push token
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  if (!expo) {
    console.warn('⚠️  Expo Push Notification service not initialized. Skipping push notification.');
    return false;
  }

  if (!isExpoPushToken(pushToken)) {
    console.error('❌ Invalid Expo push token:', pushToken);
    return false;
  }

  try {
    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      badge: 1, // Show badge on app icon
    };

    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    // Send all chunks
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error: any) {
        console.error('❌ Error sending push notification chunk:', error.message);
        return false;
      }
    }

    // Check ticket errors
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        console.error('❌ Push notification error:', ticket.message);
        if (ticket.details?.error) {
          console.error('   Error details:', ticket.details.error);
          
          // If token is invalid, we should remove it from the database
          if (ticket.details.error === 'DeviceNotRegistered') {
            console.warn(`⚠️  Push token is invalid (DeviceNotRegistered): ${pushToken.substring(0, 20)}...`);
            // Note: You might want to remove this token from the database here
          }
        }
        return false;
      }
    }

    console.log(`✅ Push notification sent successfully to ${pushToken.substring(0, 20)}...`);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to send push notification:', error.message);
    return false;
  }
}

/**
 * Send push notification for a new match
 * @param pushToken - Expo push token
 * @param matchName - Name of the person they matched with
 * @param matchId - Match ID
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendMatchPushNotification(
  pushToken: string,
  matchName: string,
  matchId: string
): Promise<boolean> {
  return sendPushNotification(
    pushToken,
    '🎉 New Match!',
    `${matchName} matched with you. Start chatting now!`,
    {
      type: 'new_match',
      matchId,
      matchName,
    }
  );
}


