import { lazy, type ComponentType } from 'react'
import { maybeReloadForStaleChunks, noteStaleChunkRouteLoaded } from './utils/staleChunk'

/** Lazy route import with a clear error when a deploy-stale chunk 404s. */
export function lazyRoute<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    importer()
      .then((mod) => {
        if (mod?.default) {
          noteStaleChunkRouteLoaded()
          return mod
        }
        const err = new Error('Route chunk failed to load (missing default export)')
        maybeReloadForStaleChunks(err)
        throw err
      })
      .catch((err: unknown) => {
        maybeReloadForStaleChunks(err)
        throw err
      }),
  )
}
