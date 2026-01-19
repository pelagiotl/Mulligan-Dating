/**
 * API Client for React Native
 * Converted from web version - uses AsyncStorage instead of localStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// API URL - use EXPO_PUBLIC_ for production builds, fallback to hardcoded production URL
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
const BASE_URL = `${API_URL}/api`;

console.log('🔧 API Client initialized:', { API_URL, BASE_URL });

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T = any>(endpoint: string, options: RequestInit & { body?: any } = {}): Promise<T> {
  // Get token from AsyncStorage (async, unlike localStorage)
  const token = await AsyncStorage.getItem('token');
  
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

  // Set Authorization header if we have a valid token
  if (hasValidToken) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
    console.log('✅ Token found for request to:', endpoint, 'Token length:', token.trim().length);
  } else {
    console.warn('⚠️ No valid token found in AsyncStorage for request to:', endpoint);
    console.warn('   Token value:', token ? `"${token.substring(0, 20)}..." (${token.length} chars)` : 'null/undefined');
    console.warn('   This will likely result in an authentication error');
  }
  
  // Log headers for debugging (but not the full token value for security)
  if (hasValidToken) {
    console.log('📋 Request headers include Authorization:', !!headers['Authorization']);
  }
  
  // Prepare body - stringify JSON if not FormData
  let body: any = options.body;
  if (!isFormData && body && typeof body === 'object') {
    body = JSON.stringify(body);
  }

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

  const url = `${BASE_URL}${endpoint}`;
  console.log('🌐 Making API request:', { 
    method: options.method || 'GET', 
    url, 
    hasToken: !!token,
    endpoint,
    baseUrl: BASE_URL
  });

  try {
    // Build fetch options, ensuring headers are set correctly and Authorization is not overridden
    const fetchOptions: RequestInit = {
      ...options,
      headers, // Set headers after spreading options to ensure our Authorization header is used
      body,
      signal: controller.signal,
    };
    
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

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
      const errorMsg = data.error || `Request failed with status ${response.status}`;
      const errorMsgLower = errorMsg.toLowerCase();
      
      // Suppress logging for informational messages that are handled gracefully
      const isInformational = errorMsgLower.includes('already unlocked') || 
                               errorMsgLower.includes('browsing is already unlocked');
      
      // Suppress 404 errors for push-token endpoint (backend may not have it deployed yet)
      const isPushToken404 = response.status === 404 && endpoint === '/auth/push-token';
      
      if (!isInformational && !isPushToken404) {
        console.error('❌ API request failed:', {
          endpoint,
          status: response.status,
          error: errorMsg,
          hasToken: !!token
        });
      }
      const apiError = new ApiError(response.status, errorMsg);
      // Preserve additional error data (like code, canClaimWeeklyToken) for error handling
      if (data.code) {
        (apiError as any).code = data.code;
      }
      if (data.canClaimWeeklyToken !== undefined) {
        (apiError as any).canClaimWeeklyToken = data.canClaimWeeklyToken;
      }
      throw apiError;
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
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
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, {
    method: 'POST',
    body
  }),
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, {
    method: 'PUT',
    body
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, {
    method: 'DELETE'
  })
};

