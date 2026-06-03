/** Minimal placeholder while a lazy route chunk loads — not the full session-restore splash. */
export default function RouteChunkFallback() {
  return (
    <div className="app-route-chunk-fallback" role="status" aria-live="polite" aria-busy="true" aria-label="Loading page">
      <div className="boot-spinner" aria-hidden />
    </div>
  )
}
