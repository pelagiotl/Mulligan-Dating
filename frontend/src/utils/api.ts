// Use API URL from environment variable (for production) or ngrok (for testing), otherwise use proxy
const API_URL: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || '';
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

  const url = `${BASE_URL}${endpoint}`
  console.log('Making API request:', { method: options.method || 'GET', url, hasToken: !!token })

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
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
      throw new ApiError(response.status, data.error || `Request failed with status ${response.status}`)
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
      throw new ApiError(408, 'Request timeout - server may be unavailable')
    }
    if (error instanceof ApiError) {
      throw error
    }
    // Check if it's a network error
    if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      throw new ApiError(0, 'Connection failed. Please check your internet connection and try again.')
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

