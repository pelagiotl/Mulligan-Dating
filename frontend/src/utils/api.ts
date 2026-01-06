// Use API URL from environment variable (for production) or ngrok (for testing), otherwise use proxy
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_NGROK_URL || '';
const BASE_URL = API_URL ? `${API_URL}/api` : '/api'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  // Add timeout to prevent hanging
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    // Check if response has content before trying to parse JSON
    const contentType = response.headers.get('content-type')
    const hasJson = contentType && contentType.includes('application/json')
    
    let data: T | any = {} as T
    if (hasJson) {
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text) as T
        } catch (e) {
          // If JSON parsing fails, throw a more helpful error
          throw new ApiError(response.status, `Invalid response from server: ${text.substring(0, 100)}`)
        }
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, (data as any).error || `Request failed with status ${response.status}`)
    }

    return data as T
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, 'Request timeout - server may be unavailable')
    }
    if (error instanceof ApiError) {
      throw error
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
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, {
    method: 'DELETE'
  })
}

