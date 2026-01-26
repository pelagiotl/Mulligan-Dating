import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({
    // Completely disable type checking
    typescript: {
      ignoreBuildErrors: true
    }
  })],
  esbuild: {
    // Disable type checking in esbuild
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Listen on all interfaces (both IPv4 and IPv6)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})

