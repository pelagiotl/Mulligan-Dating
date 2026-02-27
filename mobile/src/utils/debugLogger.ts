/**
 * Debug logging for production diagnostics (Sentry).
 * - Breadcrumbs: always sent with errors so you see the flow that led to a crash/error.
 * - Debug messages: only when "Debug logging" is enabled (Settings → tap version 7×).
 * Use this in critical flows (NHIE, Keep Browsing, payments) so you can diagnose without rebuilding.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sentry, captureMessage } from './sentry';

const DEBUG_FLAG_KEY = 'MULLIGAN_DEBUG_SENTRY';

export async function isDebugLoggingEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(DEBUG_FLAG_KEY);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export async function setDebugLoggingEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(DEBUG_FLAG_KEY, enabled ? '1' : '0');
  } catch (e) {
    console.warn('Failed to set debug logging flag', e);
  }
}

/**
 * Add a breadcrumb (always sent with the next Sentry event). Use for key steps so you see the path that led to an error.
 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({
      category,
      message,
      data: data ?? {},
      level: 'info',
    });
  } catch {
    // Sentry not initialized or failed
  }
}

/**
 * If debug logging is enabled (tap version 7× in Settings), send a message to Sentry with full context.
 * Use for detailed state (e.g. API response) so you can inspect in Sentry without a new build.
 */
export async function debugLog(category: string, message: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const enabled = await isDebugLoggingEnabled();
    if (!enabled) return;
    captureMessage(`[${category}] ${message}`, 'debug', data ?? {});
  } catch {
    // ignore
  }
}
