/**
 * Sentry Configuration
 * Captures crashes and errors for debugging
 * 
 * To set up:
 * 1. Create a Sentry account at https://sentry.io
 * 2. Create a new project for React Native
 * 3. Get your DSN from the project settings
 * 4. Add it to your environment variables or set it below
 */

import * as Sentry from '@sentry/react-native';

// Set this to your Sentry DSN (or use environment variable)
// You can get this from: https://sentry.io/settings/[your-org]/projects/[your-project]/keys/
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://20c470dcfaba07220b4bceecc63b470a@o4510739662438400.ingest.us.sentry.io/4510739666042880';

let isInitialized = false;

/**
 * Initialize Sentry (call this early in App.tsx)
 */
export function initSentry() {
  // Don't initialize if already done or if DSN is not set
  if (isInitialized || !SENTRY_DSN) {
    if (!SENTRY_DSN) {
      console.warn('⚠️ Sentry DSN not configured. Crash reporting disabled.');
      console.warn('   To enable: Set EXPO_PUBLIC_SENTRY_DSN environment variable or add DSN to src/utils/sentry.ts');
    }
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      enableInExpoDevelopment: false, // Only enable in production builds
      debug: false, // Keep false to avoid Sentry Logger [warn] (e.g. NativeFramesTracking on Expo Go)
      
      // Native crash handling
      enableNativeCrashHandling: true,
      enableNativeNagger: false,
      
      // Disable auto performance tracing so we don't get "NativeFramesTracking is not available" on Web/Expo Go
      enableAutoPerformanceTracing: false,
      
      // Performance monitoring (manual tracing still works if needed)
      tracesSampleRate: 0.1, // 10% of transactions (adjust as needed)
      
      // Release tracking
      release: process.env.EXPO_PUBLIC_APP_VERSION || undefined,
      dist: process.env.EXPO_PUBLIC_BUILD_NUMBER || undefined,
      
      // Environment
      environment: __DEV__ ? 'development' : 'production',
      
      // Filter out known non-critical errors
      beforeSend(event, hint) {
        // Don't send errors from development
        if (__DEV__) {
          console.log('Sentry would capture:', event);
          return null; // Don't send in development
        }

        // Skip Android system broadcast delivery failures (benign, not actionable)
        const excType = (event?.exception?.values?.[0]?.type ?? '').toLowerCase();
        const excValue = (event?.exception?.values?.[0]?.value ?? '').toLowerCase();
        if (
          excType.includes('cannotdeliverbroadcastexception') ||
          excValue.includes("can't deliver broadcast")
        ) {
          return null;
        }
        
        // Filter out non-critical errors
        const error = hint.originalException;
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          
          // Skip non-critical native module errors that we handle gracefully
          if (
            message.includes('notification') && 
            (message.includes('permission') || message.includes('denied'))
          ) {
            return null; // Don't send permission errors
          }
          
          // Skip network errors that are handled gracefully
          if (
            message.includes('network') || 
            message.includes('fetch failed') ||
            message.includes('timeout')
          ) {
            return null;
          }
          // Skip image load failures for /uploads/ URLs (production doesn't serve these; assets should use Cloudinary)
          if (message.includes('failed to load') && message.includes('uploads')) {
            return null;
          }
        }
        
        return event;
      },
    });
    
    isInitialized = true;
    console.log('✅ Sentry initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error);
    // Don't crash if Sentry fails to initialize
  }
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (!isInitialized) return;
  
  try {
    Sentry.captureException(error, {
      extra: context,
    });
  } catch (e) {
    console.error('Failed to capture exception in Sentry:', e);
  }
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  if (!isInitialized) return;
  
  try {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  } catch (e) {
    console.error('Failed to capture message in Sentry:', e);
  }
}

/**
 * Set user context
 */
export function setUser(user: { id?: string; email?: string; [key: string]: any }) {
  if (!isInitialized) return;
  
  try {
    Sentry.setUser(user);
  } catch (e) {
    console.error('Failed to set user in Sentry:', e);
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUser() {
  if (!isInitialized) return;
  
  try {
    Sentry.setUser(null);
  } catch (e) {
    console.error('Failed to clear user in Sentry:', e);
  }
}

export { Sentry };

