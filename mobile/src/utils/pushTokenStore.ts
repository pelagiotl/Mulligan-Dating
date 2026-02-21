/**
 * In-memory store for the current Expo push token.
 * Used so the API client can send the token on every request (fallback when POST /auth/push-token fails).
 * Also persisted to AsyncStorage so we can show it on first load; we only send it to the server when
 * it came from a fresh registration this session (avoids overwriting server with a stale token after app update).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'push_token';

let storedPushToken: string | null = null;
let hydrated = false;
/** True only when token was set by registerForPushNotificationsAsync/refresh this session (not from AsyncStorage). */
let tokenFromRegistration = false;

export function setStoredPushToken(token: string | null, options?: { fromRegistration?: boolean }): void {
  storedPushToken = token;
  tokenFromRegistration = !!(token && options?.fromRegistration);
  AsyncStorage.setItem(PUSH_TOKEN_KEY, token ?? '').catch(() => {});
}

export function getStoredPushToken(): string | null {
  return storedPushToken;
}

/**
 * Whether the stored token should be sent to the server on API requests.
 * Only true after we've received a token from the native API this session (registerForPushNotificationsAsync).
 * Avoids overwriting the server with a stale token from AsyncStorage after an app update (which can break
 * cold-start pushes until the user opens the app again).
 */
export function shouldSendTokenToServer(): boolean {
  return !!(storedPushToken && storedPushToken.trim().length > 0 && tokenFromRegistration);
}

/** Load persisted token into memory before first API call. Does NOT mark as from registration — we wait for a fresh token. */
export async function hydrateStoredPushToken(): Promise<string | null> {
  if (hydrated) return storedPushToken;
  hydrated = true;
  tokenFromRegistration = false; // hydrated token may be stale after app update
  try {
    const s = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (s && s.trim().length > 0) {
      storedPushToken = s.trim();
      return storedPushToken;
    }
  } catch (_) {}
  return storedPushToken;
}
