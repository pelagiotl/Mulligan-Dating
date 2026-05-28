// Use API URL from environment variable (for production) or ngrok (for testing)
// Default to local proxy ('/api') for local development - Vite will proxy to localhost:3001
const API_URL: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || '';
const BASE_URL = API_URL ? `${API_URL}/api` : '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Mulligan-Client': 'web',
    'User-Agent': 'Mulligan-Dating-Web/1.0',
    ...options.headers
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  // Add timeout to prevent hanging (increased for Render cold starts)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout for cold starts

  const url = `${BASE_URL}${endpoint}`
  console.log('Making API request:', { method: options.method || 'GET', url, hasToken: !!token })

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeoutId)

    // Check if response has content before trying to parse JSON
    const contentType = response.headers.get('content-type')
    const hasJson = contentType && contentType.includes('application/json')
    
    let data: any = {}
    if (hasJson) {
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text)
        } catch (e) {
          // If JSON parsing fails, throw a more helpful error
          throw new ApiError(response.status, `Invalid response from server: ${text.substring(0, 100)}`)
        }
      }
    }

    if (!response.ok) {
      const detailStr = typeof data.details === 'string' ? data.details.trim() : '';
      let message =
        data.error ||
        detailStr ||
        `Request failed with status ${response.status}`;
      if (detailStr && data.error && !message.includes(detailStr)) {
        message = `${data.error}: ${detailStr}`;
      }
      const apiError = new ApiError(response.status, message)
      // Preserve additional error data (AT_MATCH_LIMIT, etc.) for error handling
      if (data.code) (apiError as any).code = data.code
      if (data.canExpand !== undefined) (apiError as any).canExpand = data.canExpand
      if (data.currentLimit !== undefined) (apiError as any).currentLimit = data.currentLimit
      if (data.newLimit !== undefined) (apiError as any).newLimit = data.newLimit
      if (data.tokensNeeded !== undefined) (apiError as any).tokensNeeded = data.tokensNeeded
      throw apiError
    }

    return data as T
  } catch (error) {
    clearTimeout(timeoutId)
    console.error('API request failed:', {
      url,
      error,
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error)
    })
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request was aborted (timeout)')
      // Check if it's a login endpoint - might be cold start
      if (url.includes('/auth/login')) {
        throw new ApiError(408, 'Server is starting up. Please wait a moment and try again.')
      }
      throw new ApiError(408, 'Request timeout - the server may be slow or unavailable. Please try again.')
    }
    if (error instanceof ApiError) {
      throw error
    }
    // Check if it's a network error
    if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      // More helpful error messages for specific endpoints
      if (url.includes('/sms/send-code') || url.includes('/sms/verify-code')) {
        throw new ApiError(0, 'Cannot connect to server. The backend may be starting up (this can take 30-60 seconds). Please wait a moment and try again. If you have a local backend running, make sure it\'s started on port 3001.')
      }
      if (url.includes('/auth/login')) {
        throw new ApiError(0, 'Server is starting up. Please wait a moment and try again.')
      }
      throw new ApiError(0, `Connection failed. Please check your internet connection and try again. (URL: ${url})`)
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error')
  }
}

/** POST multipart (e.g. chat image/video/audio). Do not set Content-Type — browser sets boundary. */
async function requestForm<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {}
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)
  const url = `${BASE_URL}${endpoint}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const contentType = response.headers.get('content-type')
    const hasJson = contentType && contentType.includes('application/json')
    let data: unknown = {}
    if (hasJson) {
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          throw new ApiError(response.status, `Invalid response from server: ${text.substring(0, 100)}`)
        }
      }
    }
    if (!response.ok) {
      const d = data as { error?: string; code?: string }
      const apiError = new ApiError(response.status, d.error || `Request failed with status ${response.status}`)
      if (d.code) (apiError as { code?: string }).code = d.code
      throw apiError
    }
    return data as T
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, 'Upload timed out. Please try again with a smaller file or better connection.')
    }
    if (error instanceof ApiError) throw error
    if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      throw new ApiError(0, `Connection failed while uploading. (${url})`)
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error')
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  postForm: <T>(endpoint: string, formData: FormData) => requestForm<T>(endpoint, formData),
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, {
    method: 'DELETE'
  }),
  /** No-op on web (no GET cache); keeps parity with mobile api.clearCache calls. */
  clearCache: (_endpoint?: string) => {},
}

