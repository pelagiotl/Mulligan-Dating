export const CHUNK_RELOAD_KEY = 'mulligan:chunk-reload'
export const CHUNK_RELOAD_ATTEMPTS_KEY = 'mulligan:chunk-reload-attempts'
const MAX_RELOAD_ATTEMPTS = 2

/** True when a lazy route import failed after a deploy (cached main vs new hashed chunks). */
export function isStaleChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? '')
  return (
    msg.includes('_result.default') ||
    msg.includes('Route chunk failed to load') ||
    msg.includes('missing default export') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

export function clearStaleChunkReloadGuard(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPTS_KEY)
  } catch {
    /* ignore */
  }
}

/** Reset reload guards when a new frontend build is deployed. */
export function syncAppBuildReloadGuards(buildId: string): void {
  if (typeof window === 'undefined' || !buildId) return
  try {
    const key = 'mulligan:app-build'
    if (sessionStorage.getItem(key) !== buildId) {
      sessionStorage.setItem(key, buildId)
      clearStaleChunkReloadGuard()
    }
  } catch {
    /* ignore */
  }
}

function reloadWithCacheBust(): void {
  const url = new URL(window.location.href)
  url.searchParams.set('_fresh', String(Date.now()))
  window.location.replace(url.toString())
}

/** Reload once or twice so users pick up fresh index + asset hashes after deploy. */
export function maybeReloadForStaleChunks(reason: unknown): boolean {
  if (typeof window === 'undefined' || !isStaleChunkLoadError(reason)) return false
  try {
    const attempts = Number.parseInt(
      sessionStorage.getItem(CHUNK_RELOAD_ATTEMPTS_KEY) || '0',
      10,
    )
    if (attempts >= MAX_RELOAD_ATTEMPTS) return false
    sessionStorage.setItem(CHUNK_RELOAD_ATTEMPTS_KEY, String(attempts + 1))
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    reloadWithCacheBust()
    return true
  } catch {
    return false
  }
}

/** Call after any lazy route import succeeds (app is on matching hashed chunks). */
export function noteStaleChunkRouteLoaded(): void {
  clearStaleChunkReloadGuard()
}

export function forceReloadForStaleChunks(): void {
  if (typeof window === 'undefined') return
  clearStaleChunkReloadGuard()
  reloadWithCacheBust()
}
