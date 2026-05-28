/** Socket.IO connects to the backend host (same origin when the SPA is served from the API). */
export function getSocketUrl(): string {
  const env = import.meta.env as {
    VITE_SOCKET_URL?: string
    VITE_API_URL?: string
    VITE_NGROK_URL?: string
  }
  const direct = env.VITE_SOCKET_URL?.trim() || env.VITE_API_URL?.trim() || env.VITE_NGROK_URL?.trim()
  if (direct) return direct.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://localhost:3001'
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://mulligan-backend.onrender.com'
}
