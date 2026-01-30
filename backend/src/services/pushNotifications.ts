// Expo Push Notification service
// To use this, you need an Expo account (free) and push notification certificates

// Optional import - handle case where expo-server-sdk might not be installed
let Expo: any = null;
let ExpoPushMessage: any = null;

try {
  const expoSdk = require('expo-server-sdk');
  Expo = expoSdk.Expo || expoSdk.default?.Expo || expoSdk;
  ExpoPushMessage = expoSdk.ExpoPushMessage || expoSdk.default?.ExpoPushMessage;
  console.log('✅ Expo Push Notification service initialized');
} catch (error) {
  console.warn('⚠️  Expo Push Notification SDK not installed. Push notifications will be disabled.');
  console.warn('   Install with: cd backend && npm install expo-server-sdk');
}

let expo: any = null;

// Initialize Expo client (optional dependency)
try {
  if (Expo) {
    expo = new Expo();
  }
} catch (error) {
  console.warn('⚠️  Failed to initialize Expo client:', error);
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
  if (!Expo || !Expo.isExpoPushToken) {
    return false;
  }
  return Expo.isExpoPushToken(token);
}

/**
 * Send push notification to a single user
 * @param pushToken - Expo push token
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 * @param sound - Optional custom sound name (defaults to 'default')
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: any,
  sound?: string
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
    const message: any = {
      to: pushToken,
      sound: sound || 'default', // Use custom sound if provided, otherwise system default
      title,
      body,
      data: data || {},
      badge: 1, // Show badge on app icon
      priority: 'high', // High priority ensures sound plays
      channelId: 'default', // Android notification channel
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
  if (!expo) {
    console.warn('⚠️  Expo Push Notification service not initialized. Skipping push notification.');
    return false;
  }

  if (!isExpoPushToken(pushToken)) {
    console.error('❌ Invalid Expo push token:', pushToken);
    return false;
  }

  try {
    const message: any = {
      to: pushToken,
      sound: 'match-sound', // Custom match sound (match-sound.mp3 in app bundle)
      title: '🎉 New Match!',
      body: `${matchName} matched with you. Start chatting now!`,
      data: {
        type: 'new_match',
        matchId,
        matchName,
      },
      badge: 1,
      priority: 'high', // High priority ensures sound plays
      channelId: 'default', // Android notification channel
    };

    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error: any) {
        console.error('❌ Error sending match push notification chunk:', error.message);
        return false;
      }
    }

    // Check ticket errors
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        console.error('❌ Match push notification error:', ticket.message);
        return false;
      }
    }

    console.log(`✅ Match push notification sent successfully to ${pushToken.substring(0, 20)}...`);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to send match push notification:', error.message);
    return false;
  }
}

/**
 * Send push notification for a game request (Truth or Dare / Never Have I Ever)
 * @param pushToken - Expo push token
 * @param fromUserName - Name of the person who sent the request
 * @param gameType - 'truth_or_dare' | 'never_have_i_ever'
 * @param matchId - Match ID
 * @param fromUserId - Sender user ID
 * @param requestId - Game request ID
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendGameRequestPushNotification(
  pushToken: string,
  fromUserName: string,
  gameType: 'truth_or_dare' | 'never_have_i_ever',
  matchId: string,
  fromUserId: string,
  requestId: string
): Promise<boolean> {
  const gameLabel = gameType === 'truth_or_dare' ? 'Truth or Dare' : 'Never Have I Ever';
  const emoji = gameType === 'truth_or_dare' ? '🎲' : '🙊';
  return sendPushNotification(
    pushToken,
    `${emoji} Game invite`,
    `${fromUserName} wants to play ${gameLabel} with you!`,
    {
      type: 'game_request',
      matchId,
      fromUserId,
      fromUserName,
      gameType,
      requestId,
    },
    'message-sound'
  );
}

/**
 * Send push notification for a new message
 * @param pushToken - Expo push token
 * @param senderName - Name of the person who sent the message
 * @param messagePreview - Preview of the message content
 * @param matchId - Match ID
 * @param senderId - Sender user ID
 * @returns Promise<boolean> - true if sent successfully
 */
export async function sendMessagePushNotification(
  pushToken: string,
  senderName: string,
  messagePreview: string,
  matchId: string,
  senderId: string
): Promise<boolean> {
  // Use 'message-sound' for messages (different from match sound)
  // Make sure message-sound.mp3 is in mobile/assets/ directory
  return sendPushNotification(
    pushToken,
    senderName,
    messagePreview,
    {
      type: 'new_message',
      matchId,
      senderId,
      senderName,
    },
    'message-sound' // Custom message sound (message-sound.mp3 in app bundle)
  );
}


