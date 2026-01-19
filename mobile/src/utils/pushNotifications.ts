/**
 * Push Notification Service
 * Registers for push notifications and sends token to backend
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';

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
  
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    notificationHandlerInitialized = true;
  } catch (error) {
    console.warn('⚠️  Failed to set notification handler (non-critical):', error);
  }
}

/**
 * Register for push notifications and send token to backend
 * Call this after user logs in
 * @returns Promise<string | null> - Push token if successful, null otherwise
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    // Initialize notification handler (lazy initialization)
    initializeNotificationHandler();
    
    // Request permissions
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.warn('⚠️  Push notification permissions not granted');
      return null;
    }

    // Get Expo push token
    // projectId is required for Expo SDK 51+ - get it from expo-constants
    let projectId: string | undefined;
    try {
      // Safely access Constants - it might not be available in all environments
      if (Constants && typeof Constants === 'object') {
        const expoConfig = (Constants as any).expoConfig;
        if (expoConfig && typeof expoConfig === 'object') {
          const extra = expoConfig.extra;
          if (extra && typeof extra === 'object') {
            projectId = extra.eas?.projectId || extra.easProjectId;
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Error accessing Constants.expoConfig:', error);
    }
    
    if (!projectId) {
      console.warn('⚠️  No Expo projectId found. Push notifications will not work in Expo Go.');
      console.warn('   This is expected - projectId will be automatically set when building with EAS.');
      console.warn('   Push notifications will work in TestFlight/production builds.');
      // Skip push token registration if no projectId (Expo Go scenario)
      // projectId will be available in EAS builds automatically
      return null;
    }
    
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    const pushToken = tokenData.data;
    console.log('✅ Expo push token obtained:', pushToken.substring(0, 30) + '...');

    // Send token to backend
    try {
      await api.post('/auth/push-token', { pushToken });
      console.log('✅ Push token sent to backend successfully');
      return pushToken;
    } catch (error: any) {
      // Suppress error if route not found or backend unavailable (non-critical)
      if (error?.status === 404 || error?.message?.includes('Route not found')) {
        console.warn('⚠️  Push token route not available (backend may need update). This is non-critical.');
      } else {
        console.warn('⚠️  Failed to send push token to backend (non-critical):', error?.message || error);
      }
      return pushToken; // Still return token even if backend update fails
    }
  } catch (error) {
    console.error('❌ Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Clear push token from backend (call on logout)
 */
export async function clearPushToken(): Promise<void> {
  try {
    await api.post('/auth/push-token', { pushToken: null });
    console.log('✅ Push token cleared from backend');
  } catch (error) {
    console.error('❌ Failed to clear push token from backend:', error);
  }
}

