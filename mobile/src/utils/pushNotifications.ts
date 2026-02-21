/**
 * Push Notification Service
 * Registers for push notifications and sends token to backend
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';
import { safeNativeModuleCall } from './nativeModuleGuard';
import { setStoredPushToken } from './pushTokenStore';
import { initiatorMatchIdRef, connectInitiatorAtRef } from './currentMatchView';

// Flag to track if notification handler has been initialized
let notificationHandlerInitialized = false;

/**
 * Initialize notification handler (call this lazily instead of at module level)
 * This prevents crashes if Notifications module isn't ready during import
 */
function initializeNotificationHandler() {
  if (notificationHandlerInitialized) {
    return;
  }
  
  // Only initialize if app is ready
  safeNativeModuleCall(
    async () => {
      try {
        Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        try {
          const data = notification?.request?.content?.data as { type?: string; matchId?: string } | undefined;
          // Don't show the "matched with you" banner for User A (initiator) — they only see the celebration card
          const isInitiatorMatch = data?.type === 'new_match' && data?.matchId && (
            initiatorMatchIdRef.current === data.matchId ||
            (connectInitiatorAtRef.current && Date.now() - connectInitiatorAtRef.current < 15000)
          );
          if (isInitiatorMatch) {
            return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
          }
          return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          };
        } catch (error) {
          console.error('⚠️  Error in notification handler (non-critical):', error);
          return { shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true };
        }
      },
    });
        notificationHandlerInitialized = true;
      } catch (error) {
        console.warn('⚠️  Failed to set notification handler (non-critical):', error);
        throw error; // Re-throw so safeNativeModuleCall can handle it
      }
    },
    'Notifications.setNotificationHandler',
    { required: false }
  ).catch(() => {
    // Silently fail - handler initialization is non-critical
  });
}

/**
 * Register for push notifications and send token to backend
 * Call this after user logs in
 * @returns Promise<string | null> - Push token if successful, null otherwise
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Use the native module guard to ensure app is initialized
  const result = await safeNativeModuleCall(async () => {
    // Initialize notification handler (lazy initialization)
    // Wrap in try-catch to prevent any initialization errors from crashing
    try {
      initializeNotificationHandler();
    } catch (initError) {
      console.warn('⚠️  Failed to initialize notification handler (non-critical):', initError);
      // Continue anyway - handler initialization failure shouldn't block registration
    }
    
    // Android: create default channel before requesting permission (required for FCM / Expo).
    // Must match backend channelId: 'default'. On Android 13+ also ensure app.json has
    // android.permission.POST_NOTIFICATIONS and rebuild the app.
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Messages & matches',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B1538',
          sound: 'default',
          enableVibrate: true,
          enableLights: true,
          description: 'New messages and match notifications',
        });
      } catch (channelError) {
        console.warn('⚠️  Failed to set notification channel (non-critical):', channelError);
        // Continue anyway
      }
    }

    let finalStatus: string;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (permissionError) {
      console.warn('⚠️  Failed to check/request permissions (non-critical):', permissionError);
      return null; // Can't proceed without permissions
    }
    
    if (finalStatus !== 'granted') {
      console.warn('⚠️  Push notification permissions not granted — outside-app notifications will not work.');
      return null;
    }

    // Android: give FCM time to initialize before requesting token (reduces "token null" / no delivery)
    if (Platform.OS === 'android') {
      await new Promise((r) => setTimeout(r, 800));
    }

    // Get Expo push token
    // projectId is required for Expo SDK 51+ - get it from expo-constants
    let projectId: string | undefined;
    try {
      // Safely access Constants - it might not be available in all environments
      // Add multiple layers of defensive checks
      if (typeof Constants !== 'undefined' && Constants && typeof Constants === 'object') {
        try {
          const expoConfig = (Constants as any).expoConfig;
          if (expoConfig && typeof expoConfig === 'object') {
            const extra = expoConfig.extra;
            if (extra && typeof extra === 'object') {
              projectId = extra.eas?.projectId || extra.easProjectId;
            }
          }
        } catch (configError) {
          console.warn('⚠️  Error accessing Constants.expoConfig:', configError);
        }
      }
    } catch (constantsError) {
      console.warn('⚠️  Error accessing Constants (non-critical):', constantsError);
    }
    
    if (!projectId) {
      console.warn('⚠️  Push: No projectId — token not requested. (Expo Go has no projectId; use a new EAS/TestFlight build.)');
      return null;
    }

    const fetchToken = async (): Promise<string | null> => {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        if (tokenData?.data?.trim()) return tokenData.data;
      } catch (e: any) {
        if (__DEV__) console.warn('⚠️  getExpoPushTokenAsync:', e?.message || e);
      }
      return null;
    };

    // Get push token (Android: retry once after 2s if FCM wasn't ready)
    let pushToken: string | null = await fetchToken();
    if (Platform.OS === 'android' && !pushToken) {
      await new Promise((r) => setTimeout(r, 2000));
      pushToken = await fetchToken();
      if (pushToken && __DEV__) console.log('📲 Push: Android token obtained on retry');
    }
    if (!pushToken) {
      console.warn('⚠️  Push: Could not get Expo push token. On Android, use an EAS/development build (not Expo Go) and ensure notifications are allowed.');
      return null;
    }

    // Store so api client can send on every request (fallback if POST fails). Mark as from registration
    // so we send it to the server; avoid sending hydrated (stale) token after app update.
    setStoredPushToken(pushToken, { fromRegistration: true });
    console.log('📲 Push: Got Expo token — will send with every request so backend can save it.');
    // Send token to backend (retry on failure so message notifications work)
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await api.post('/auth/push-token', { pushToken });
        console.log('✅ Push token saved to backend — outside-app notifications enabled.');
        return pushToken;
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        const msg = error?.message || String(error);
        console.warn(`⚠️  Push token save failed (attempt ${attempt}/${maxRetries}): status=${status} message=${msg}`);
        const is404 = status === 404 || msg.includes('Route not found');
        if (is404) {
          return pushToken;
        }
        if (status === 401 || msg.includes('unauthorized') || msg.includes('token')) {
          console.warn('⚠️  Push: Backend rejected (auth). Ensure you are logged in and try again.');
        }
        if (attempt < maxRetries) {
          const delayMs = attempt * 2000;
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          setStoredPushToken(pushToken, { fromRegistration: true }); // still send on future requests so backend can save
          return pushToken;
        }
      }
    }
    setStoredPushToken(pushToken, { fromRegistration: true });
    return pushToken;
  }, 'PushNotifications', {
    maxWaitMs: 10000, // Wait up to 10 seconds for app initialization
    fallbackValue: null,
    required: false, // Non-critical - app can work without push notifications
  });

  return result || null;
}

/**
 * Refresh push token and send to backend (e.g. when app goes to background).
 * Ensures the server has the latest token so subsequent message pushes are delivered
 * even if the token was refreshed by FCM/APNs while the app was in foreground.
 */
export async function refreshAndSendPushTokenOnBackground(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData?.data;
    if (!pushToken?.trim()) return;
    setStoredPushToken(pushToken, { fromRegistration: true });
    await api.post('/auth/push-token', { pushToken });
    if (__DEV__) console.log('📲 Push token refreshed and sent on background');
  } catch (e) {
    // Non-critical: stored token may still be valid
    if (__DEV__) console.warn('⚠️  Push refresh on background (non-critical):', (e as Error)?.message ?? e);
  }
}

/**
 * Clear push token from backend (call on logout)
 */
export async function clearPushToken(): Promise<void> {
  setStoredPushToken(null);
  try {
    await api.post('/auth/push-token', { pushToken: null });
    console.log('✅ Push token cleared from backend');
  } catch (error) {
    console.error('❌ Failed to clear push token from backend:', error);
  }
}

