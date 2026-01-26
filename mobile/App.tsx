/**
 * Main App Entry Point
 * Sets up navigation and authentication
 */

// IMPORTANT: react-native-gesture-handler must be imported FIRST
// This is required for React Navigation to work properly
import 'react-native-gesture-handler';

import React from 'react';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initSentry, captureException, captureMessage } from './src/utils/sentry';

// Initialize Sentry early (before anything else that might crash)
// This will capture native crashes and JavaScript errors
initSentry();

// Global error handlers to prevent fatal crashes
// These catch unhandled promise rejections and errors that could crash the app
if (typeof ErrorUtils !== 'undefined') {
  const originalGlobalHandler = ErrorUtils.getGlobalHandler();
  
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Enhanced logging with more context
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      isFatal,
      name: error.name,
      timestamp: new Date().toISOString(),
      // Try to capture more context
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    };
    
    console.error('🚨 Global Error Handler:', errorInfo);
    
    // Capture in Sentry for better diagnostics
    try {
      captureException(error, {
        isFatal,
        errorInfo,
      });
    } catch (sentryError) {
      console.error('Failed to capture error in Sentry:', sentryError);
    }
    
    // Log to a way that will show up in crash reports
    // @ts-ignore - ErrorUtils might have additional properties
    if (error.nativeStackAndroid || error.nativeStackIOS) {
      const nativeStack = {
        android: (error as any).nativeStackAndroid,
        ios: (error as any).nativeStackIOS,
      };
      console.error('🚨 Native stack trace:', nativeStack);
      
      // Also capture native stack in Sentry
      try {
        captureMessage('Native stack trace captured', 'error', nativeStack);
      } catch (e) {
        // Ignore Sentry errors in error handler
      }
    }
    
    // Check if this is a native module error that we can handle gracefully
    const isNativeModuleError = 
      error.message?.includes('RCTNativeModule') ||
      error.message?.includes('native module') ||
      error.message?.includes('Cannot find native module') ||
      error.stack?.includes('RCTNativeModule');
    
    // Check if this is a push notification or audio error (non-critical)
    const isNonCriticalError =
      error.message?.includes('notification') ||
      error.message?.includes('push') ||
      error.message?.includes('audio') ||
      error.message?.includes('sound') ||
      error.message?.includes('Audio');
    
    // For native module errors that are non-critical, log but don't crash
    if (isNativeModuleError && (isNonCriticalError || !isFatal)) {
      console.warn('⚠️ Native module error caught (non-critical), preventing crash:', {
        message: error.message,
        name: error.name,
      });
      // Don't call original handler - prevent crash
      return;
    }
    
    // For other errors, try to handle gracefully
    // Only call original handler if it's truly fatal and not recoverable
    if (originalGlobalHandler) {
      // For non-fatal errors, log but don't crash
      if (!isFatal) {
        console.warn('⚠️ Non-fatal error caught, continuing...');
        return;
      }
      
      // For fatal errors that aren't native module errors, use original handler
      // But wrap it in try-catch to prevent double-crash
      try {
        originalGlobalHandler(error, isFatal);
      } catch (handlerError) {
        console.error('🚨 Error in global error handler itself:', handlerError);
        // At this point, we've done our best - let React Native handle it
      }
    }
  });
}

// Handle unhandled promise rejections
if (typeof global !== 'undefined') {
  const originalUnhandledRejection = (global as any).onunhandledrejection;
  
  (global as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const errorDetails = reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name,
    } : reason;
    
    console.error('🚨 Unhandled Promise Rejection:', {
      reason: errorDetails,
    });
    
    // Capture in Sentry
    try {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      captureException(error, {
        type: 'unhandledPromiseRejection',
      });
    } catch (sentryError) {
      console.error('Failed to capture promise rejection in Sentry:', sentryError);
    }
    
    // Check if this is a non-critical native module error
    const errorMessage = reason?.message || String(reason || '');
    const isNonCriticalNativeError =
      errorMessage.includes('notification') ||
      errorMessage.includes('push') ||
      errorMessage.includes('audio') ||
      errorMessage.includes('sound') ||
      errorMessage.includes('RCTNativeModule') ||
      errorMessage.includes('native module');
    
    // For non-critical errors, prevent crash
    if (isNonCriticalNativeError) {
      console.warn('⚠️ Non-critical promise rejection caught, preventing crash');
      event.preventDefault?.();
      return; // Don't call original handler - prevent crash
    }
    
    // Prevent the default behavior (which would crash the app)
    event.preventDefault?.();
    
    // Call original handler if it exists
    if (originalUnhandledRejection) {
      try {
        originalUnhandledRejection(event);
      } catch (handlerError) {
        console.error('🚨 Error in promise rejection handler:', handlerError);
      }
    }
  };
}

// Note: Stripe PaymentSheet requires a development build (not Expo Go)
// For now, using web-based payment flow that works with Expo Go
export default function App() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    // Mark app as initialized after a delay to ensure everything is mounted
    // This prevents native module calls during startup
    const timer = setTimeout(() => {
      setIsMounted(true);
      // Dynamic import to avoid circular dependencies
      import('./src/utils/nativeModuleGuard').then(({ markAppInitialized }) => {
        markAppInitialized();
        console.log('✅ App fully initialized - native modules can be called safely');
      });
    }, 2000); // 2 second delay after mount

    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ErrorBoundary>
  );
}

