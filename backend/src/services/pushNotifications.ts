import { isWebPushConfigured } from "./webPushDelivery.js";

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
// EXPO_ACCESS_TOKEN is recommended for reliable delivery (create at https://expo.dev/accounts/[account]/settings/access-tokens)
try {
  if (Expo) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    expo = accessToken ? new Expo({ accessToken }) : new Expo();
    console.log(`📲 Push: Expo SDK loaded. EXPO_ACCESS_TOKEN is ${accessToken ? 'set (push delivery enabled)' : 'NOT SET — set on Render for outside-app notifications'}.`);
  }
} catch (error) {
  console.warn('⚠️  Failed to initialize Expo client:', error);
}

/**
 * True if any out-of-app push path is available (Expo native and/or Web Push / PWA).
 */
export function isPushNotificationConfigured(): boolean {
  return expo !== null || isWebPushConfigured();
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

export type PushResult = { sent: boolean; invalidToken?: boolean };

/**
 * We no longer throttle message pushes with setTimeout — delayed sends were often never
 * running on serverless/cold-start hosts (e.g. Render) because the process sleeps after
 * the request returns, so "first 2–3 pushes work, then stop". Send every message push
 * immediately in the request so it always runs. Expo/APNs may rate-limit; we only treat
 * DeviceNotRegistered as invalid token.
 */
export function getMessagePushThrottleDelayMs(_recipientId: string): number {
  return 0;
}

export function recordMessagePushSent(_recipientId: string): void {
  // no-op (kept for API compat)
}

/**
 * Send push notification to a single user
 * @returns PushResult - { sent, invalidToken } so callers can clear DB when token is dead
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: any,
  sound?: string
): Promise<PushResult> {
  if (!expo) {
    console.warn('⚠️  Expo Push Notification service not initialized. Skipping push notification.');
    return { sent: false };
  }
  if (!process.env.EXPO_ACCESS_TOKEN) {
    console.warn('⚠️  EXPO_ACCESS_TOKEN is not set — push may not be delivered (especially on Android). Set it in Render environment and redeploy.');
  }

  if (!isExpoPushToken(pushToken)) {
    console.error('❌ Invalid Expo push token:', pushToken);
    return { sent: false };
  }

  try {
    const message: any = {
      to: pushToken,
      sound: sound || 'default',
      title,
      body,
      data: data || {},
      badge: 1,
      priority: 'high',
      channelId: 'default',
    };

    const chunks = expo.chunkPushNotifications([message]);
    const tickets: any[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error: any) {
        console.error('❌ Error sending push notification chunk:', error.message);
        return { sent: false };
      }
    }

    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        const err = ticket.details?.error;
        console.error('❌ Push notification error:', ticket.message, err ? `(${err})` : '');
        if (err === 'DeviceNotRegistered') {
          console.warn(`⚠️  Push token invalid (DeviceNotRegistered): ${pushToken.substring(0, 28)}... — caller should clear this token`);
          return { sent: false, invalidToken: true };
        }
        return { sent: false };
      }
    }

    console.log(`✅ Push notification sent successfully to ${pushToken.substring(0, 28)}...`);
    return { sent: true };
  } catch (error: any) {
    console.error('❌ Failed to send push notification:', error.message);
    return { sent: false };
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
  matchId: string,
  connectedVia?: string,
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
      title: '😍 New match!',
      body: `${matchName} matched with you. Say hi!`,
      data: {
        type: 'new_match',
        matchId,
        matchName,
        ...(connectedVia ? { connectedVia } : {}),
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
  const result = await sendPushNotification(
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
  return result.sent;
}

/**
 * Send push notification for a new message
 * @param messageId - Optional; include so each push has a unique id (Android shows separate notifications instead of collapsing)
 * @returns PushResult - { sent, invalidToken } so route can clear DB when token is dead
 */
export async function sendMessagePushNotification(
  pushToken: string,
  senderName: string,
  messagePreview: string,
  matchId: string,
  senderId: string,
  messageId?: string
): Promise<PushResult> {
  return sendPushNotification(
    pushToken,
    senderName,
    messagePreview,
    {
      type: 'new_message',
      matchId,
      senderId,
      senderName,
      ...(messageId ? { messageId } : {}),
    },
    'message-sound'
  );
}

/**
 * Send push when someone loved your message (heart reaction)
 */
export async function sendMessageLikedPushNotification(
  pushToken: string,
  likerName: string,
  matchId: string,
  messageId?: string
): Promise<PushResult> {
  return sendPushNotification(
    pushToken,
    '❤️ Message loved',
    `${likerName} loved your message`,
    {
      type: 'message_liked',
      matchId,
      likerName,
      ...(messageId ? { messageId } : {}),
    },
    'default'
  );
}

/**
 * Send push when someone laughed at your message
 */
export async function sendMessageLaughedPushNotification(
  pushToken: string,
  laugherName: string,
  matchId: string,
  messageId?: string
): Promise<PushResult> {
  return sendPushNotification(
    pushToken,
    '😂 Message reaction',
    `${laugherName} laughed at your message`,
    {
      type: 'message_laughed',
      matchId,
      laugherName,
      ...(messageId ? { messageId } : {}),
    },
    'default'
  );
}

/**
 * Send push when someone heart-eyes reacted to your message
 */
export async function sendMessageHeartEyesPushNotification(
  pushToken: string,
  reactorName: string,
  matchId: string,
  messageId?: string
): Promise<PushResult> {
  return sendPushNotification(
    pushToken,
    '😍 Message reaction',
    `${reactorName} reacted to your message`,
    {
      type: 'message_heart_eyes',
      matchId,
      reactorName,
      ...(messageId ? { messageId } : {}),
    },
    'default'
  );
}


