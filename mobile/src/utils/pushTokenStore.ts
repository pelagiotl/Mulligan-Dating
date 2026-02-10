/**
 * In-memory store for the current Expo push token.
 * Used so the API client can send the token on every request (fallback when POST /auth/push-token fails).
 * Also persisted to AsyncStorage so the first request after cold start includes the token (fixes
 * outside-app notifications for the recipient when they open the app less often).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'push_token';

let storedPushToken: string | null = null;
let hydrated = false;

export function setStoredPushToken(token: string | null): void {
  storedPushToken = token;
  AsyncStorage.setItem(PUSH_TOKEN_KEY, token ?? '').catch(() => {});
}

export function getStoredPushToken(): string | null {
  return storedPushToken;
}

/** Load persisted token into memory before first API call so /auth/me and other early requests send it. */
export async function hydrateStoredPushToken(): Promise<string | null> {
  if (hydrated) return storedPushToken;
  hydrated = true;
  try {
    const s = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (s && s.trim().length > 0) {
      storedPushToken = s.trim();
      return storedPushToken;
    }
  } catch (_) {}
  return storedPushToken;
}
