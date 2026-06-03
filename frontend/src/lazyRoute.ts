import { lazy, type ComponentType } from 'react'

/** Lazy route import with a clear error when a deploy-stale chunk 404s. */
export function lazyRoute<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    importer().then((mod) => {
      if (mod?.default) return mod
      throw new Error('Route chunk failed to load (missing default export)')
    }),
  )
}
