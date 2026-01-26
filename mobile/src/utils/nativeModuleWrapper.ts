/**
 * Safe wrapper for native module calls
 * Helps prevent crashes and provides better error logging
 */

/**
 * Safely call a native module function with error handling
 * This wrapper catches errors and logs them before they can crash the app
 */
export async function safeNativeCall<T>(
  fn: () => Promise<T>,
  moduleName: string,
  functionName: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: any) {
    console.error(`❌ Native module error [${moduleName}.${functionName}]:`, {
      message: error?.message || String(error),
      name: error?.name || 'Unknown',
      stack: error?.stack || 'No stack trace',
      module: moduleName,
      function: functionName,
    });
    
    // Return fallback value if provided, otherwise undefined
    return fallbackValue;
  }
}

/**
 * Safely call a synchronous native module function
 */
export function safeNativeCallSync<T>(
  fn: () => T,
  moduleName: string,
  functionName: string,
  fallbackValue?: T
): T | undefined {
  try {
    return fn();
  } catch (error: any) {
    console.error(`❌ Native module sync error [${moduleName}.${functionName}]:`, {
      message: error?.message || String(error),
      name: error?.name || 'Unknown',
      stack: error?.stack || 'No stack trace',
      module: moduleName,
      function: functionName,
    });
    
    return fallbackValue;
  }
}






