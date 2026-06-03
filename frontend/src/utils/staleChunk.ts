export const CHUNK_RELOAD_KEY = 'mulligan:chunk-reload'

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

/** Reload once per session so users pick up fresh index + asset hashes after deploy. */
export function maybeReloadForStaleChunks(reason: unknown): boolean {
  if (typeof window === 'undefined' || !isStaleChunkLoadError(reason)) return false
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    window.location.reload()
    return true
  } catch {
    return false
  }
}
