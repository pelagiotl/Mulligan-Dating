/**
 * Native Module Guard
 * Prevents native module calls until the app is fully initialized
 * This helps prevent crashes during startup
 */

let appInitialized = false;
let initializationTimeout: NodeJS.Timeout | null = null;

/**
 * Mark app as initialized (call this after app has mounted)
 */
export function markAppInitialized() {
  appInitialized = true;
  if (initializationTimeout) {
    clearTimeout(initializationTimeout);
    initializationTimeout = null;
  }
}

/**
 * Check if app is initialized
 */
export function isAppInitialized(): boolean {
  return appInitialized;
}

/**
 * Wait for app to be initialized before executing a native module call
 * This prevents crashes from calling native modules too early
 */
export async function waitForInitialization(maxWaitMs: number = 5000): Promise<boolean> {
  if (appInitialized) {
    return true;
  }

  // Wait up to maxWaitMs for initialization
  const startTime = Date.now();
  while (!appInitialized && (Date.now() - startTime) < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return appInitialized;
}

/**
 * Safely execute a native module function after ensuring app is initialized
 */
export async function safeNativeModuleCall<T>(
  fn: () => Promise<T>,
  moduleName: string,
  options: {
    maxWaitMs?: number;
    fallbackValue?: T;
    required?: boolean;
  } = {}
): Promise<T | undefined> {
  const { maxWaitMs = 5000, fallbackValue, required = false } = options;

  // Wait for app initialization
  const initialized = await waitForInitialization(maxWaitMs);
  
  if (!initialized && required) {
    console.warn(`⚠️ [NativeModuleGuard] App not initialized, skipping ${moduleName} call`);
    return fallbackValue;
  }

  if (!initialized) {
    console.warn(`⚠️ [NativeModuleGuard] App not initialized yet for ${moduleName}, waiting...`);
    // Still try to execute, but log a warning
  }

  try {
    return await fn();
  } catch (error: any) {
    console.error(`❌ [NativeModuleGuard] Error in ${moduleName}:`, {
      message: error?.message || String(error),
      name: error?.name || 'Unknown',
      stack: error?.stack || 'No stack trace',
    });
    return fallbackValue;
  }
}

// Auto-initialize after a delay (fallback in case markAppInitialized isn't called)
// This gives the app 3 seconds to fully mount — silent so we don't spam the console
initializationTimeout = setTimeout(() => {
  if (!appInitialized) {
    markAppInitialized();
  }
}, 3000);






