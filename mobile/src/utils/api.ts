/**
 * API Client for React Native
 * Converted from web version - uses AsyncStorage instead of localStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiCache, APICache } from './apiCache';
import { getStoredPushToken, shouldSendTokenToServer } from './pushTokenStore';
import { safeClearTimeout } from './safeTimers';

// API URL - use EXPO_PUBLIC_ for production builds, fallback to hardcoded production URL
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
const BASE_URL = `${API_URL}/api`;

/** Absolute URL for an API path (`/profile`, `/photos`, …). Handles EXPO_PUBLIC_API_URL with or without `/api`. */
export function resolveApiUrl(path: string): string {
  const origin = API_URL.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const apiPath = normalized.startsWith('/api/') ? normalized : `/api${normalized}`;
  return `${origin}${apiPath}`;
}

const APP_VERSION =
  Constants.expoConfig?.version ?? (Constants.manifest as { version?: string } | null)?.version ?? '1.0.0';
/** OkHttp’s default UA is often blocked by edge/WAF on SMS routes; browsers and curl use a recognizable UA. */
const DEFAULT_API_USER_AGENT = `Mulligan/${APP_VERSION} (${Platform.OS === 'ios' ? 'iOS' : 'Android'}; ReactNative)`;

let tokenCache: string | null | undefined = undefined;
let pushTokenHeaderLogged = false;

export function clearTokenCache() {
  tokenCache = undefined;
}

export function setTokenCache(token: string | null) {
  tokenCache = token ?? null;
}

/** Called when the API client clears the token due to 401 or 403 (invalid/expired). AuthContext registers this to logout and redirect to login. */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}

function notifySessionExpired() {
  const cb = onSessionExpired;
  if (cb) setTimeout(() => { try { cb(); } catch (_) {} }, 0);
}

export function prefetchToken() {
  if (tokenCache === undefined) {
    AsyncStorage.getItem('token').then((t) => {
      tokenCache = t ?? null;
    });
  }
}

/** Returns a promise that resolves when token is in cache. Call when Connect button is about to be shown. */
export function ensureTokenPrefetched(): Promise<void> {
  if (tokenCache !== undefined) return Promise.resolve();
  return AsyncStorage.getItem('token').then((t) => {
    tokenCache = t ?? null;
  });
}

export async function getToken(): Promise<string | null> {
  if (tokenCache !== undefined) return tokenCache;
  tokenCache = await AsyncStorage.getItem('token');
  return tokenCache;
}

console.log('🔧 API Client initialized:', { API_URL, BASE_URL });

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** RN Android reports "Network request failed"; browsers use "Failed to fetch", etc. */
function isLikelyNetworkTransportFailure(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : typeof error === 'string'
          ? error
          : '';
  if (!raw) return false;
  const m = raw.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('internet connection appears to be offline')
  );
}

function completeXhrToResponse(xhr: XMLHttpRequest): Response {
  const h = new Headers();
  const block = xhr.getAllResponseHeaders();
  if (block) {
    for (const line of block.trim().split(/[\r\n]+/)) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const name = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (name) h.append(name, value);
      }
    }
  }
  return new Response(xhr.responseText, {
    status: xhr.status,
    statusText: xhr.statusText,
    headers: h,
  });
}

function applyXhrHeaders(xhr: XMLHttpRequest, headerObj: Record<string, string>) {
  for (const [key, value] of Object.entries(headerObj)) {
    try {
      xhr.setRequestHeader(key, value);
    } catch {
      /* ignore disallowed header names */
    }
  }
}

/**
 * When fetch() fails on some Android AVDs (e.g. tablet images), XHR can still succeed.
 */
function androidGetViaXhr(
  urlStr: string,
  headerObj: Record<string, string>,
  xhrTimeoutMs: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = xhrTimeoutMs;
    xhr.onload = () => {
      try {
        resolve(completeXhrToResponse(xhr));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request failed'));
    xhr.open('GET', urlStr);
    applyXhrHeaders(xhr, headerObj);
    xhr.send();
  });
}

function androidPostJsonViaXhr(
  urlStr: string,
  headerObj: Record<string, string>,
  jsonBody: string,
  xhrTimeoutMs: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = xhrTimeoutMs;
    xhr.onload = () => {
      try {
        resolve(completeXhrToResponse(xhr));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request failed'));
    xhr.open('POST', urlStr);
    applyXhrHeaders(xhr, headerObj);
    xhr.send(jsonBody);
  });
}

type RequestOptions = RequestInit & { body?: any; timeoutMs?: number };

async function request<T = any>(endpoint: string, options: RequestOptions = {}, useCache: boolean = true): Promise<T> {
  // Check cache for GET requests
  const isGetRequest = !options.method || options.method === 'GET';
  if (isGetRequest && useCache) {
    const cacheKey = APICache.getCacheKey(endpoint);
    const cached = apiCache.get<T>(cacheKey);
    if (cached !== null) {
      if (__DEV__) console.log('💾 Cache hit for:', endpoint);
      return cached;
    }
  }

  const token = await getToken();
  
  // Validate token - must be non-null, non-empty string
  const hasValidToken = token && typeof token === 'string' && token.trim().length > 0;
  
  // Check if body is FormData - if so, don't set Content-Type (let fetch set it with boundary)
  const isFormData = options.body instanceof FormData;
  const methodUpper = (options.method || 'GET').toUpperCase();
  const sendsJsonBody =
    methodUpper === 'POST' || methodUpper === 'PUT' || methodUpper === 'PATCH';
  
  // Build headers object - merge any existing headers from options first
  const headers: Record<string, string> = {};
  
  // If options has headers, merge them (but convert to plain object if needed)
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }
  
  // JSON Content-Type only when we send a body — GET + application/json breaks some Android OkHttp paths.
  if (!isFormData && !headers['Content-Type'] && sendsJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = DEFAULT_API_USER_AGENT;
  }

  if (!headers['X-Mulligan-Client'] && !headers['x-mulligan-client']) {
    headers['X-Mulligan-Client'] = Platform.OS === 'ios' ? 'ios' : 'android';
  }

  if (
    Platform.OS === 'android' &&
    !isGetRequest &&
    !headers.Connection &&
    !headers.connection
  ) {
    headers.Connection = 'close';
  }

  // Set Authorization header if we have a valid token (no warning when missing — expected when logged out)
  if (hasValidToken) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const isPreAuthSmsEndpoint =
    endpoint === '/sms/send-code' || endpoint === '/sms/verify-code';

  // Push token on GET caused Android transport failures for /tokens; POST /auth/push-token + non-GET requests are enough.
  if (!isPreAuthSmsEndpoint && !isGetRequest && shouldSendTokenToServer()) {
    const pushToken = getStoredPushToken();
    if (pushToken?.trim()) {
      headers['X-Push-Token'] = pushToken.trim();
      if (__DEV__ && !pushTokenHeaderLogged) {
        pushTokenHeaderLogged = true;
        console.log('📲 X-Push-Token sent with request — backend will save for outside-app notifications');
      }
    }
  }
  
  // Prepare body - stringify JSON if not FormData
  let body: any = options.body;
  if (!isFormData && body && typeof body === 'object') {
    body = JSON.stringify(body);
  }

  // Timeout: longer for message send (consecutive sends / slow server), default 45s
  const timeoutMs = options.timeoutMs ?? 45000;
  const url = `${BASE_URL}${endpoint}`;
  const { timeoutMs: _timeoutOpt, body: _bodyInOptions, ...restOptionsForFetch } = options;
  /**
   * Android OkHttp + RN fetch: including `body` on GET (even undefined) can trigger
   * "Network request failed" while POST to the same host still works.
   */
  const buildFetchInit = (signal: AbortSignal): RequestInit => {
    if (isGetRequest) {
      return { ...restOptionsForFetch, headers, signal };
    }
    return { ...restOptionsForFetch, headers, body, signal };
  };

  /** Android often surfaces flaky TLS/DNS as "Network request failed"; GET + pre-auth SMS POST retry safely. */
  const transportAttempts =
    isGetRequest || (isPreAuthSmsEndpoint && !isGetRequest) ? 3 : 1;

  const fetchOnceWithTimeout = async (): Promise<Response> => {
    const controller = new AbortController();
    const attemptTid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, buildFetchInit(controller.signal));
    } finally {
      safeClearTimeout(attemptTid);
    }
  };

  const obtainResponse = async (): Promise<Response> => {
    const preferXhrFirst =
      Platform.OS === 'android' && isGetRequest && !isFormData;
    if (preferXhrFirst) {
      try {
        const r = await androidGetViaXhr(url, headers, timeoutMs);
        if (__DEV__) {
          console.log(`📡 Android GET via XMLHttpRequest: ${endpoint}`);
        }
        return r;
      } catch (xhrErr) {
        if (__DEV__) {
          console.warn(`⚠️ Android XHR GET failed for ${endpoint}, using fetch`, xhrErr);
        }
      }
    }

    const preferSmsXhrFirst =
      Platform.OS === 'android' &&
      methodUpper === 'POST' &&
      isPreAuthSmsEndpoint &&
      typeof body === 'string' &&
      !isFormData;
    if (preferSmsXhrFirst) {
      try {
        const r = await androidPostJsonViaXhr(url, headers, body, timeoutMs);
        if (__DEV__) {
          console.log(`📡 Android SMS POST via XMLHttpRequest: ${endpoint}`);
        }
        return r;
      } catch (xhrErr) {
        if (__DEV__) {
          console.warn(`⚠️ Android XHR SMS POST failed for ${endpoint}, using fetch`, xhrErr);
        }
      }
    }

    let lastErr: unknown;
    for (let i = 1; i <= transportAttempts; i++) {
      try {
        return await fetchOnceWithTimeout();
      } catch (e) {
        lastErr = e;
        const canRetryFetch = i < transportAttempts && isLikelyNetworkTransportFailure(e);
        if (canRetryFetch) {
          if (__DEV__) {
            console.warn(`⚠️ Transport retry ${i}/${transportAttempts} for ${endpoint}`);
          }
          await new Promise((r) => setTimeout(r, 500 * i));
          continue;
        }
        if (
          i === transportAttempts &&
          Platform.OS === 'android' &&
          isLikelyNetworkTransportFailure(e)
        ) {
          if (
            isPreAuthSmsEndpoint &&
            methodUpper === 'POST' &&
            typeof body === 'string' &&
            !isFormData
          ) {
            try {
              const r = await androidPostJsonViaXhr(url, headers, body, timeoutMs);
              if (__DEV__) {
                console.warn(`📡 SMS POST fallback via XMLHttpRequest: ${endpoint}`);
              }
              return r;
            } catch {
              /* fall through */
            }
          }
          if (!preferXhrFirst && isGetRequest && !isFormData) {
            try {
              const r = await androidGetViaXhr(url, headers, timeoutMs);
              if (__DEV__) {
                console.warn(`📡 GET fallback via XMLHttpRequest: ${endpoint}`);
              }
              return r;
            } catch {
              /* fall through */
            }
          }
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };

  try {
    let response: Response = await obtainResponse();

    // Retry GET on 502 (server cold start) - up to 3 attempts with backoff (only GET can safely retry)
    if (response.status === 502 && isGetRequest) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const delay = attempt * 4000; // 4s, 8s, 12s
        if (__DEV__) console.log(`⚠️ 502 received, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        response = await fetchOnceWithTimeout();
        if (response.status !== 502) break;
      }
    }

    // Check if response has content before trying to parse JSON
    const contentType = response.headers.get('content-type');
    const hasJson = contentType && contentType.includes('application/json');
    
    let data: any = {};
    if (hasJson) {
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new ApiError(response.status, `Invalid response from server: ${text.substring(0, 100)}`);
        }
      }
    }

    if (!response.ok) {
      // Clear cache on error
      if (isGetRequest && useCache) {
        const cacheKey = APICache.getCacheKey(endpoint);
        apiCache.clear(cacheKey);
      }
      let errorMsg = data.error || `Request failed with status ${response.status}`;
      if (response.status === 502) {
        errorMsg = 'Server is starting up. Please wait a moment and try again.';
      }
      const errorMsgLower = errorMsg.toLowerCase();
      
      // Suppress logging for informational messages that are handled gracefully
      const isInformational = errorMsgLower.includes('already unlocked') || 
                               errorMsgLower.includes('browsing is already unlocked');
      
      // Suppress 404 errors for push-token endpoint (backend may not have it deployed yet)
      const isPushToken404 = response.status === 404 && endpoint === '/auth/push-token';
      
      // Suppress 404 / "no date plan" for date-plan endpoint (expected when no plan exists yet)
      const isDatePlan404 = (response.status === 404 || (errorMsgLower.includes('no date plan found'))) && endpoint.includes('/date-plan');
      
      // 401: expected when not logged in (no token) or when session expired/invalid (we clear token and show login)
      const isUnauthenticatedExpected = response.status === 401 && !token;
      const isSessionExpired = response.status === 401 && !!token;
      
      // 429 on startup or login endpoints: rate limit hit; UI shows friendly message, don't spam ERROR
      const isRateLimitedStartup = response.status === 429 &&
        (endpoint === '/auth/me' || endpoint === '/auth/push-token' ||
         endpoint === '/sms/send-code' || endpoint === '/sms/verify-code');
      
      // 403 from browse when user is outside Southern Oregon — expected; UI shows message and stays on landing
      const isRegionLock403 = response.status === 403 &&
        endpoint.includes('/users/browse') &&
        (errorMsgLower.includes('southern oregon') || errorMsgLower.includes('only available for people'));
      
      if (isRegionLock403) {
        console.warn('⚠️ Browse unavailable (region):', errorMsg);
      } else if (!isInformational && !isPushToken404 && !isDatePlan404 && !isUnauthenticatedExpected && !isSessionExpired && !isRateLimitedStartup) {
        console.error('❌ API request failed:', {
          endpoint,
          status: response.status,
          error: errorMsg,
          authTokenPresent: !!token  // Bearer token; not weekly/match token
        });
      }
      // Clear stored token only when we actually sent one (avoids clearing on race: request without token gets 401 and wipes session — fixes Android "matches disappear on reopen")
      if (response.status === 401 && hasValidToken) {
        clearTokenCache();
        AsyncStorage.removeItem('token').catch(() => {});
        notifySessionExpired();
      }
      if (response.status === 403 && hasValidToken) {
        const msg = (errorMsg || '').toLowerCase();
        if (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired'))) {
          clearTokenCache();
          AsyncStorage.removeItem('token').catch(() => {});
          notifySessionExpired();
        }
      }
      const apiError = new ApiError(response.status, errorMsg);
      // Preserve additional error data (like code, canClaimWeeklyToken, AT_MATCH_LIMIT fields) for error handling
      if (data.code) {
        (apiError as any).code = data.code;
      }
      if (data.missing !== undefined) {
        (apiError as any).missing = data.missing;
      }
      if (data.canClaimWeeklyToken !== undefined) {
        (apiError as any).canClaimWeeklyToken = data.canClaimWeeklyToken;
      }
      if (data.canExpand !== undefined) {
        (apiError as any).canExpand = data.canExpand;
      }
      if (data.currentLimit !== undefined) {
        (apiError as any).currentLimit = data.currentLimit;
      }
      if (data.newLimit !== undefined) {
        (apiError as any).newLimit = data.newLimit;
      }
      if (data.tokensNeeded !== undefined) {
        (apiError as any).tokensNeeded = data.tokensNeeded;
      }
      if (data.details && typeof data.details === 'string') {
        (apiError as any).details = data.details;
      }
      throw apiError;
    }

    // Cache successful GET responses
    if (isGetRequest && useCache) {
      const cacheKey = APICache.getCacheKey(endpoint);
      // Cache for different durations based on endpoint
      let ttl = 5 * 60 * 1000; // 5 minutes default
      if (endpoint.includes('/matches')) {
        ttl = 30 * 1000; // 30 seconds for matches (frequently updated)
      } else if (endpoint.includes('/profile')) {
        ttl = 2 * 60 * 1000; // 2 minutes for profile
      } else if (endpoint.includes('/users/browse')) {
        ttl = 10 * 1000; // 10 seconds for browse (very dynamic)
      } else if (endpoint === '/tokens' || endpoint.startsWith('/tokens')) {
        ttl = 60 * 1000; // 60 seconds for tokens to avoid rate limit (429); balance still refreshes after claim/connect
      }
      apiCache.set(cacheKey, data, ttl);
    }

    return data as T;
  } catch (error) {
    // Per-attempt timeouts are cleared in-branch (SMS retries vs single-request path).
    // Don't log date-plan 404 (no plan yet) — expected and handled by UI
    const isDatePlan404Rethrown =
      error instanceof ApiError &&
      (error.status === 404 || error.message?.toLowerCase().includes('no date plan found')) &&
      url.includes('/date-plan');
    if (isDatePlan404Rethrown) {
      throw error;
    }
    // Don't log 401 (auth required / session expired) — we already handled it above and clear token
    const isAuthRequired =
      (error instanceof ApiError && error.status === 401) ||
      (error instanceof Error && /authentication required/i.test(error.message));
    // Don't log 429 on startup/login endpoints (rate limit; UI shows friendly message)
    const isRateLimitedStartupCatch =
      error instanceof ApiError && error.status === 429 &&
      (endpoint === '/auth/me' || endpoint === '/auth/push-token' ||
       endpoint === '/sms/send-code' || endpoint === '/sms/verify-code');
    // 403 browse region lock (Southern Oregon) — expected; don't log as ERROR
    const isRegionLock403Catch =
      error instanceof ApiError && error.status === 403 &&
      endpoint.includes('/users/browse') &&
      (error.message?.toLowerCase().includes('southern oregon') || error.message?.toLowerCase().includes('only available for people'));
    if (isRegionLock403Catch) {
      console.warn('⚠️ Browse unavailable (region):', error.message);
    } else if (!isAuthRequired && !isRateLimitedStartupCatch) {
      const errorDetails = {
        url,
        endpoint,
        baseUrl: BASE_URL,
        error,
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      console.error('❌ API request failed:', errorDetails);
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request was aborted (timeout)');
      if (url.includes('/auth/login') || url.includes('/sms/verify-code')) {
        throw new ApiError(408, 'Server is starting up. Please wait a moment and try again.');
      }
      throw new ApiError(408, 'Request timeout - the server may be slow or unavailable. Please try again.');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    if (isLikelyNetworkTransportFailure(error)) {
      // More helpful error messages for specific endpoints
      if (url.includes('/sms/send-code') || url.includes('/sms/verify-code')) {
        throw new ApiError(
          0,
          'Cannot reach Mulligan right now. Check Wi-Fi or cellular data, disable VPN if you use one, and try again. If the app was just opened, wait 30-60 seconds (the server may be waking up) and retry.'
        );
      }
      if (url.includes('/auth/login')) {
        throw new ApiError(0, 'Server is starting up. Please wait a moment and try again.');
      }
      throw new ApiError(0, `Connection failed. Please check your internet connection and try again. (URL: ${url})`);
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error');
  }
}

export const api = {
  get: <T>(endpoint: string, useCache: boolean = true) => request<T>(endpoint, {}, useCache),
  post: <T>(endpoint: string, body: unknown, extraOptions?: { timeoutMs?: number }) => {
    // Clear related cache entries on POST
    if (endpoint.includes('/matches/connect')) {
      apiCache.clear(APICache.getCacheKey('/matches'));
    }
    if (endpoint.includes('grant-tokens') || endpoint.includes('/tokens/claim')) {
      apiCache.clear(APICache.getCacheKey('/tokens'));
    }
    if (endpoint.includes('never-have-i-ever') || endpoint.includes('truth-or-dare')) {
      apiCache.clear();
    }
    if (endpoint === '/profile') {
      apiCache.clear(APICache.getCacheKey('/profile'));
    }
    // Message send: 35s timeout (safety unstick at 40s on client); avoid 2min hang on cold server/weak network
    const isMessageSend = /\/matches\/[^/]+\/messages$/.test(endpoint);
    const timeoutMs = extraOptions?.timeoutMs ?? (isMessageSend ? 35000 : 45000);
    return request<T>(endpoint, {
      method: 'POST',
      body,
      timeoutMs,
    }, false);
  },
  put: <T>(endpoint: string, body: unknown) => {
    // Clear related cache entries on PUT
    if (endpoint.includes('/profile') || endpoint.includes('/preferences')) {
      apiCache.clear(APICache.getCacheKey('/profile'));
    }
    if (endpoint.includes('/profile/basics')) {
      apiCache.clear(APICache.getCacheKey('/profile'));
      apiCache.clear(APICache.getCacheKey('/auth/me'));
    }
    if (endpoint.includes('/settings')) {
      apiCache.clear(APICache.getCacheKey('/settings'));
    }
    return request<T>(endpoint, {
      method: 'PUT',
      body
    }, false);
  },
  delete: <T>(endpoint: string) => {
    // Clear related cache entries on DELETE so refetches get fresh data
    if (endpoint.includes('/matches')) {
      apiCache.clear(APICache.getCacheKey('/matches'));
    }
    if (endpoint.includes('/photos/')) {
      apiCache.clear(APICache.getCacheKey('/photos/me'));
    }
    return request<T>(endpoint, {
      method: 'DELETE'
    }, false);
  },
  // Utility to clear cache
  clearCache: (endpoint?: string) => {
    if (endpoint) {
      apiCache.clear(APICache.getCacheKey(endpoint));
    } else {
      apiCache.clearAll();
    }
  }
};

