const MULLIGAN_WEB_HOST_SUFFIXES = [
  'mulligan-frontend.onrender.com',
  'mulligandating.app',
  'mulligandating.com',
]

function configuredCrossOriginApiBase(): string | null {
  const env = import.meta.env as { VITE_API_URL?: string; VITE_NGROK_URL?: string }
  const url = env.VITE_API_URL?.trim() || env.VITE_NGROK_URL?.trim()
  return url ? `${url.replace(/\/$/, '')}/api` : null
}

export function isMulliganWebHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (MULLIGAN_WEB_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true
  }
  return /^mulligan[-a-z0-9]*\.onrender\.com$/.test(host)
}

async function probeSameOriginApi(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const response = await fetch('/api/health', {
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return false
    const text = await response.text()
    if (!text.trim().startsWith('{')) return false
    try {
      const j = JSON.parse(text) as { status?: string; ok?: boolean }
      return j.status === 'ok' || j.ok === true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

let cachedBase: string | null = null
let resolving: Promise<string> | null = null

/** Prefer same-origin /api when server.mjs proxy or bundled backend is available. */
export async function resolveApiBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase
  if (!resolving) {
    resolving = (async () => {
      if (import.meta.env.DEV) {
        cachedBase = '/api'
        return cachedBase
      }

      const configured = configuredCrossOriginApiBase()
      if (configured) {
        cachedBase = configured
        return cachedBase
      }

      if (typeof window !== 'undefined' && isMulliganWebHost(window.location.hostname)) {
        if (await probeSameOriginApi()) {
          cachedBase = '/api'
          return cachedBase
        }
      }

      cachedBase = 'https://mulligan-backend.onrender.com/api'
      return cachedBase
    })()
  }
  return resolving
}
