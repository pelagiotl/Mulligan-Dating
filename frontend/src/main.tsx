import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ConnectShellThemeProvider } from './context/ConnectShellThemeContext.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import './styles/index.css'
import './styles/mobile-native-shell.css'
import './styles/native-ui-parity.css'
import './styles/connect-shell-theme.css'
import './styles/connect-button-effects.css'
import './styles/legal-document.css'
import { applyConnectShellMode, DEFAULT_CONNECT_SHELL_MODE } from './lib/connectShellTheme'
import { registerPushSoundBridge } from './lib/pushSoundBridge'

const CHUNK_RELOAD_KEY = 'mulligan:chunk-reload'

function isStaleChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? '')
  return (
    msg.includes('_result.default') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

function maybeReloadForStaleChunks(reason: unknown) {
  if (typeof window === 'undefined' || !isStaleChunkLoadError(reason)) return
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    window.location.reload()
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    maybeReloadForStaleChunks(event.reason)
  })
}

if (typeof document !== 'undefined') {
  applyConnectShellMode(DEFAULT_CONNECT_SHELL_MODE)
}

registerPushSoundBridge()

if (typeof document !== 'undefined') {
  document.getElementById('boot-fallback')?.remove()
  ;(window as Window & { __MULLIGAN_APP_MOUNTED__?: boolean }).__MULLIGAN_APP_MOUNTED__ = true
  try {
    sessionStorage.removeItem('mulligan:pwa-boot-reload')
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    /* ignore */
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ConnectShellThemeProvider>
            <App />
          </ConnectShellThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

