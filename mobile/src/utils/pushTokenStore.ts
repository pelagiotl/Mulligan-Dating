/**
 * In-memory store for the current Expo push token.
 * Used so the API client can send the token on every request (fallback when POST /auth/push-token fails).
 */

let storedPushToken: string | null = null;

export function setStoredPushToken(token: string | null): void {
  storedPushToken = token;
}

export function getStoredPushToken(): string | null {
  return storedPushToken;
}
