/**
 * Native Module Guard
 * Prevents native module calls until the app is fully initialized
 * This helps prevent crashes during startup
 */

import { safeClearTimeout } from './safeTimers';

let appInitialized = false;
let initializationTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Mark app as initialized (call this after app has mounted)
 */
export function markAppInitialized() {
  appInitialized = true;
  const tid = initializationTimeout;
  initializationTimeout = null;
  safeClearTimeout(tid);
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
    const msg = String(error?.message ?? error ?? '');
    // Bridgeless / Expo Go: some native stacks reject with this before the native runtime is ready.
    if (/native is disabled/i.test(msg) && !required) {
      if (__DEV__) {
        console.warn(`⚠️ [NativeModuleGuard] ${moduleName}: native disabled — skipping (non-fatal)`);
      }
      return fallbackValue;
    }
    console.error(`❌ [NativeModuleGuard] Error in ${moduleName}:`, {
      message: error?.message || String(error),
      name: error?.name || 'Unknown',
      stack: error?.stack || 'No stack trace',
    });
    return fallbackValue;
  }
}

// Auto-initialize after a delay (fallback in case markAppInitialized isn't called).
// Do NOT call markAppInitialized() from inside this timer: clearing this same timeout from its callback
// throws "clearTimeout called with an invalid handle" on Hermes / NOBRIDGE.
initializationTimeout = setTimeout(() => {
  initializationTimeout = null;
  if (!appInitialized) {
    appInitialized = true;
  }
}, 3000);






