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

if (typeof document !== 'undefined') {
  applyConnectShellMode(DEFAULT_CONNECT_SHELL_MODE)
}

registerPushSoundBridge()

if (typeof window !== 'undefined') {
  ;(window as Window & { __MULLIGAN_APP_MOUNTED__?: boolean }).__MULLIGAN_APP_MOUNTED__ = true
  try {
    sessionStorage.removeItem('mulligan:pwa-boot-reload')
  } catch {
    /* ignore */
  }
  document.getElementById('boot-fallback')?.remove()
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

