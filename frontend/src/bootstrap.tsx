/**
 * Minimal entry: load the full app asynchronously so boot UI can show errors if the main chunk fails.
 */
function showBootFailure(message: string) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div id="boot-fallback" style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc;">
      <img src="/app-icon.png?v=20260603" width="72" height="72" alt="" style="border-radius:16px;margin-bottom:1rem;" />
      <h1 style="margin:0 0 0.5rem;font-size:1.5rem;">Mulligan</h1>
      <p style="margin:0 0 1rem;opacity:0.9;max-width:20rem;line-height:1.45;">${message}</p>
      <button type="button" id="boot-reload-btn" style="padding:0.65rem 1.2rem;border:none;border-radius:999px;background:#fff;color:#4f46e5;font-weight:700;font-size:0.95rem;">Reload</button>
    </div>
  `
  document.getElementById('boot-reload-btn')?.addEventListener('click', () => {
    window.location.reload()
  })
}

void import('./main.tsx').catch((err) => {
  console.error('Mulligan app failed to start:', err)
  showBootFailure('Could not start Mulligan. Tap Reload to try again.')
})
