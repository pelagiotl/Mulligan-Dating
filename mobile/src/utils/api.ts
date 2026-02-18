/**
 * API Client for React Native
 * Converted from web version - uses AsyncStorage instead of localStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCache, APICache } from './apiCache';
import { getStoredPushToken } from './pushTokenStore';

// API URL - use EXPO_PUBLIC_ for production builds, fallback to hardcoded production URL
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
const BASE_URL = `${API_URL}/api`;

let tokenCache: string | null | undefined = undefined;
let pushTokenHeaderLogged = false;

export function clearTokenCache() {
  tokenCache = undefined;
}

export function setTokenCache(token: string | null) {
  tokenCache = token ?? null;
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

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
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
  
  // Set Content-Type if not FormData
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Set Authorization header if we have a valid token (no warning when missing — expected when logged out)
  if (hasValidToken) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  // Send push token on every request so backend can save it (fallback when POST /auth/push-token fails)
  const pushToken = getStoredPushToken();
  if (pushToken && typeof pushToken === 'string' && pushToken.trim().length > 0) {
    headers['X-Push-Token'] = pushToken.trim();
    if (__DEV__ && !pushTokenHeaderLogged) {
      pushTokenHeaderLogged = true;
      console.log('📲 X-Push-Token sent with request — backend will save for outside-app notifications');
    }
  }
  
  // Prepare body - stringify JSON if not FormData
  let body: any = options.body;
  if (!isFormData && body && typeof body === 'object') {
    body = JSON.stringify(body);
  }

  // Timeout: longer for message send (consecutive sends / slow server), default 45s
  const timeoutMs = options.timeoutMs ?? 45000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${BASE_URL}${endpoint}`;

  const doRequest = async (): Promise<Response> => {
    const { timeoutMs: _tm, ...restOptions } = options;
    const fetchOptions: RequestInit = {
      ...restOptions,
      headers,
      body,
      signal: controller.signal,
    };
    return fetch(url, fetchOptions);
  };

  try {
    let response = await doRequest();
    clearTimeout(timeoutId);

    // Retry GET on 502 (server cold start) - up to 3 attempts with backoff (only GET can safely retry)
    if (response.status === 502 && isGetRequest) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const delay = attempt * 4000; // 4s, 8s, 12s
        if (__DEV__) console.log(`⚠️ 502 received, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        response = await doRequest();
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
      
      // 401 with no token is expected when not logged in — don't log as error
      const isUnauthenticatedExpected = response.status === 401 && !token;
      
      if (!isInformational && !isPushToken404 && !isDatePlan404 && !isUnauthenticatedExpected) {
        console.error('❌ API request failed:', {
          endpoint,
          status: response.status,
          error: errorMsg,
          hasToken: !!token
        });
      }
      // Clear stored token on auth errors so app can show login instead of repeated 403s
      if (response.status === 401) {
        clearTokenCache();
        AsyncStorage.removeItem('token').catch(() => {});
      }
      if (response.status === 403) {
        const msg = (errorMsg || '').toLowerCase();
        if (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired'))) {
          clearTokenCache();
          AsyncStorage.removeItem('token').catch(() => {});
        }
      }
      const apiError = new ApiError(response.status, errorMsg);
      // Preserve additional error data (like code, canClaimWeeklyToken, AT_MATCH_LIMIT fields) for error handling
      if (data.code) {
        (apiError as any).code = data.code;
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
        ttl = 15 * 1000; // 15 seconds for tokens (admin grants, claims, etc.)
      }
      apiCache.set(cacheKey, data, ttl);
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
    // Don't log date-plan 404 (no plan yet) — expected and handled by UI
    const isDatePlan404Rethrown =
      error instanceof ApiError &&
      (error.status === 404 || error.message?.toLowerCase().includes('no date plan found')) &&
      url.includes('/date-plan');
    if (isDatePlan404Rethrown) {
      throw error;
    }
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
    if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      // More helpful error messages for specific endpoints
      if (url.includes('/sms/send-code') || url.includes('/sms/verify-code')) {
        throw new ApiError(0, 'Cannot connect to server. The backend may be starting up (this can take 30-60 seconds). Please wait a moment and try again.');
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
    if (endpoint === '/profile') {
      apiCache.clear(APICache.getCacheKey('/profile'));
    }
    // Message send: longer timeout when server is slow or multiple sends in sequence
    const isMessageSend = /\/matches\/[^/]+\/messages$/.test(endpoint);
    const timeoutMs = extraOptions?.timeoutMs ?? (isMessageSend ? 90000 : 45000);
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

