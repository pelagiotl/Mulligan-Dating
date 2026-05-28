/** Socket.IO connects to the backend host (not proxied through /api). */
export function getSocketUrl(): string {
  const env = import.meta.env as {
    VITE_SOCKET_URL?: string
    VITE_API_URL?: string
    VITE_NGROK_URL?: string
  }
  const direct = env.VITE_SOCKET_URL?.trim() || env.VITE_API_URL?.trim() || env.VITE_NGROK_URL?.trim()
  if (direct) return direct.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://localhost:3001'
  return 'https://mulligan-backend.onrender.com'
}
