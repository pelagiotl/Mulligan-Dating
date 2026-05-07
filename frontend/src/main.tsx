import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import './styles/index.css'
import './styles/mobile-native-shell.css'
import './styles/native-ui-parity.css'

// iOS Safari: notification clicks may focus a window without navigating, or deep links can 404 on cold start.
// Service worker uses /?pwaOpen=... (see public/sw.js); App.tsx applies the route. Main thread also handles
// postMessage for older SW versions.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const d = event.data as { type?: string; url?: string } | undefined
    if (d?.type === 'MULLIGAN_NOTIFICATION_NAVIGATE' && typeof d.url === 'string' && d.url.trim()) {
      try {
        window.location.assign(d.url)
      } catch {
        /* ignore */
      }
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

