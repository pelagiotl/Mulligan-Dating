/**
 * Tiny entry chunk: runs before the main app bundle downloads so boot UI can update.
 */
const win = window as Window & {
  __MULLIGAN_ENTRY_LOADED__?: boolean
  __MULLIGAN_SHOW_BOOT_ERROR__?: (msg: string) => void
}

win.__MULLIGAN_ENTRY_LOADED__ = true

function setBootMessage(msg: string) {
  const el = document.getElementById('boot-fallback')
  const p = el?.querySelector('p')
  if (p) p.textContent = msg
}

setBootMessage('Starting Mulligan…')

void import('./main.tsx')
  .then(() => {
    document.getElementById('boot-fallback')?.remove()
    try {
      sessionStorage.removeItem('mulligan:pwa-boot-reload')
      sessionStorage.removeItem('mulligan:chunk-reload')
    } catch {
      /* ignore */
    }
  })
  .catch((err: unknown) => {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load app'
    const show = win.__MULLIGAN_SHOW_BOOT_ERROR__
    if (show) {
      show(`Could not start Mulligan. ${message}`)
      return
    }
    setBootMessage(`Could not start Mulligan. ${message}`)
  })
